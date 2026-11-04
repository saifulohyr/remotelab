<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CommandLog;
use App\Models\CommandResult;
use App\Models\Pc;
use App\Models\PowerEvent;
use App\Models\User;
use App\Services\MqttPublisher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CommandController extends Controller
{
    public function store(Request $request, MqttPublisher $mqtt): JsonResponse
    {
        $request->validate([
            'action' => 'required|string|in:shutdown,reboot,logoff,lock,message,wake,run_script',
            'target_type' => 'required|in:pc,lab,all',
            'target_id' => 'nullable|integer',
            'pc_ids' => 'nullable|array|min:1|max:180',
            'pc_ids.*' => 'integer|distinct',
            'params' => 'nullable|array',
            'params.delay' => 'nullable|integer|min:0|max:3600',
            'params.message' => 'nullable|string|max:500',
            'params.title' => 'nullable|string|max:100',
            'params.script' => 'nullable|string|max:10000',
            'params.shell' => 'nullable|string|in:powershell,cmd',
            'reason' => 'nullable|string|max:500',
            'ttl_seconds' => 'nullable|integer|min:10|max:3600',
        ]);

        $user = $request->user();
        $action = $request->input('action');
        $targetType = $request->input('target_type');
        $targetId = $request->input('target_id');
        $pcIds = $targetType === 'pc'
            ? array_values(array_unique($request->input('pc_ids', $targetId ? [$targetId] : [])))
            : [];

        if (($targetType === 'lab' && ! $targetId) || ($targetType === 'pc' && empty($pcIds))) {
            return response()->json(['message' => 'Target perintah tidak lengkap.'], 422);
        }
        if ($action === 'run_script' && ! $user->isSuperAdmin()) {
            return response()->json(['message' => 'Hanya superadmin yang dapat menjalankan script.'], 403);
        }

        $params = $request->input('params', []);
        $reason = $request->input('reason');
        $ttlSeconds = $request->input('ttl_seconds', 120);
        $pcs = $this->resolveTargetPCs($user, $targetType, $targetId, $pcIds);

        if ($pcs->isEmpty() || ($targetType === 'pc' && $pcs->count() !== count($pcIds))) {
            return response()->json(['message' => 'Target tidak valid atau berada di luar akses Anda.'], 422);
        }
        if ($pcs->count() > 1 && empty($reason)) {
            return response()->json(['message' => 'Alasan wajib diisi untuk perintah massal.'], 422);
        }

        $commandId = (string) Str::uuid7();
        $issuedAt = now();
        $commandLog = CommandLog::create([
            'command_id' => $commandId,
            'user_id' => $user->id,
            'target_type' => $targetType,
            'target_id' => $targetType === 'pc' ? ($pcIds[0] ?? null) : $targetId,
            'action' => $action,
            'params' => $params,
            'reason' => $reason,
            'issued_at' => $issuedAt,
            'ttl_seconds' => $ttlSeconds,
            'source' => 'manual',
        ]);

        foreach ($pcs as $pc) {
            CommandResult::create([
                'command_log_id' => $commandLog->id,
                'pc_id' => $pc->id,
                'status' => 'pending',
            ]);
        }

        $mqttPayload = [
            'command_id' => $commandId,
            'action' => $action,
            'params' => $params,
            'issued_at' => $issuedAt->timestamp,
            'ttl_seconds' => $ttlSeconds,
        ];

        $published = 0;
        $failed = 0;
        if ($action === 'wake') {
            foreach ($pcs->groupBy('lab_id') as $labPcs) {
                $lab = $labPcs->first()->lab;
                $macs = $labPcs->pluck('mac_address')->filter()->values()->all();
                $success = ! empty($macs) && $mqtt->publish("simlab/{$lab->slug}/relay/wake", $mqttPayload + [
                    'macs' => $macs,
                    'broadcast_ip' => $lab->subnet_broadcast ?? '255.255.255.255',
                ]);

                foreach ($labPcs as $pc) {
                    $this->recordDispatch($pc, $commandLog, $success, $user, $published, $failed);
                }
            }
        } else {
            foreach ($pcs as $pc) {
                $success = $mqtt->publish("simlab/{$pc->lab->slug}/{$pc->slug}/command", $mqttPayload);
                $this->recordDispatch($pc, $commandLog, $success, $user, $published, $failed);
            }
        }

        $status = $failed === 0 ? Response::HTTP_CREATED : ($published === 0 ? 502 : 207);
        $message = $failed === 0
            ? "Perintah diterima server dan dipublish untuk {$published} PC; menunggu ACK."
            : "Dispatch selesai dengan kegagalan: {$published} dipublish, {$failed} gagal.";

        return response()->json([
            'message' => $message,
            'data' => [
                'command_id' => $commandId,
                'action' => $action,
                'target_count' => $pcs->count(),
                'published_count' => $published,
                'failed_count' => $failed,
                'issued_at' => $issuedAt->toIso8601String(),
            ],
        ], $status);
    }

    private function recordDispatch(Pc $pc, CommandLog $log, bool $success, User $user, int &$published, int &$failed): void
    {
        if ($success) {
            $published++;
            if ($log->action === 'wake') {
                $pc->update(['last_wake_at' => now()]);
                PowerEvent::create([
                    'pc_id' => $pc->id,
                    'event_type' => 'wake_sent',
                    'source' => 'manual',
                    'user_id' => $user->id,
                    'created_at' => now(),
                ]);
            }

            return;
        }

        $failed++;
        CommandResult::where('command_log_id', $log->id)->where('pc_id', $pc->id)->update([
            'status' => 'failed',
            'error_message' => 'MQTT publish failed',
        ]);
        if ($log->action === 'wake') {
            PowerEvent::create([
                'pc_id' => $pc->id,
                'event_type' => 'wake_failed',
                'source' => 'manual',
                'user_id' => $user->id,
                'created_at' => now(),
            ]);
        }
    }

    public function index(Request $request): JsonResponse
    {
        $perPage = min($request->query('per_page', 25), 100);
        $query = CommandLog::with([
            'user:id,name',
            'results.pc:id,hostname,slug',
            'results:id,command_log_id,pc_id,status,output,error_message,executed_at',
        ])->orderByDesc('issued_at');

        $this->scopeToUser($query, $request->user());

        if ($labId = $request->query('lab_id')) {
            $query->whereHas('results.pc', fn ($q) => $q->where('lab_id', $labId));
        }
        if ($action = $request->query('action')) {
            $query->where('action', $action);
        }
        if ($from = $request->query('from')) {
            $query->where('issued_at', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $query->where('issued_at', '<=', $to);
        }

        return response()->json($query->paginate($perPage));
    }

    public function show(Request $request, int $commandLog): JsonResponse
    {
        $log = CommandLog::with(['user:id,name', 'results.pc:id,hostname,slug,lab_id'])->findOrFail($commandLog);
        $user = $request->user();
        if ($user->isOperator()) {
            $labIds = $user->labs()->pluck('labs.id');
            if (! $log->results->contains(fn ($result) => $labIds->contains($result->pc?->lab_id))) {
                return response()->json(['message' => 'Akses ditolak.'], 403);
            }
        }

        return response()->json(['data' => $log]);
    }

    public function export(Request $request): StreamedResponse
    {
        $query = CommandLog::with(['user:id,name', 'results.pc:id,hostname,slug,lab_id'])->orderByDesc('issued_at');
        $this->scopeToUser($query, $request->user());

        if ($from = $request->query('from')) {
            $query->where('issued_at', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $query->where('issued_at', '<=', $to);
        }
        if ($labId = $request->query('lab_id')) {
            $query->whereHas('results.pc', fn ($q) => $q->where('lab_id', $labId));
        }

        $logs = $query->limit(5000)->get();

        return response()->streamDownload(function () use ($logs) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['Command ID', 'Waktu', 'Pelaku', 'Aksi', 'Target', 'Alasan', 'Sumber', 'Jumlah PC', 'Status']);
            foreach ($logs as $log) {
                $statusSummary = $log->results->groupBy('status')->map(fn ($g, $s) => "$s:{$g->count()}")->implode(', ');
                fputcsv($handle, [
                    $log->command_id,
                    $log->issued_at->format('Y-m-d H:i:s'),
                    $log->user?->name ?? 'System',
                    $log->action,
                    "{$log->target_type}:{$log->target_id}",
                    $log->reason ?? '-',
                    $log->source,
                    $log->results->count(),
                    $statusSummary,
                ]);
            }
            fclose($handle);
        }, 'command-logs-'.now()->format('Ymd-His').'.csv', ['Content-Type' => 'text/csv']);
    }

    private function scopeToUser($query, User $user): void
    {
        if ($user->isOperator()) {
            $labIds = $user->labs()->pluck('labs.id');
            $query->whereHas('results.pc', fn ($q) => $q->whereIn('lab_id', $labIds));
        }
    }

    private function resolveTargetPCs(User $user, string $targetType, ?int $targetId, array $pcIds)
    {
        $query = Pc::query();
        if ($user->isOperator()) {
            $query->whereIn('lab_id', $user->labs()->pluck('labs.id'));
        }

        if ($targetType === 'pc') {
            $query->whereIn('id', $pcIds);
        } elseif ($targetType === 'lab') {
            $query->where('lab_id', $targetId);
        }

        return $query->with('lab:id,slug')->get();
    }
}
