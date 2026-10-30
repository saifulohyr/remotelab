<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CommandLog;
use App\Models\CommandResult;
use App\Models\Lab;
use App\Models\Pc;
use App\Services\MqttPublisher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CommandController extends Controller
{
    /**
     * POST /api/commands — Issue a command to PC(s).
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'action' => 'required|string|in:shutdown,reboot,logoff,lock,message,wake,run_script',
            'target_type' => 'required|in:pc,lab,all',
            'target_id' => 'required_unless:target_type,all|integer',
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
        $params = $request->input('params', []);
        $reason = $request->input('reason');
        $ttlSeconds = $request->input('ttl_seconds', 120);

        // Resolve target PCs
        $pcs = $this->resolveTargetPCs($user, $targetType, $targetId);
        if ($pcs->isEmpty()) {
            return response()->json([
                'message' => 'Tidak ada PC yang valid untuk perintah ini.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        // Require reason for bulk commands
        if ($pcs->count() > 1 && empty($reason)) {
            return response()->json([
                'message' => 'Alasan wajib diisi untuk perintah massal.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $commandId = (string) Str::uuid7();
        $issuedAt = now();

        // Create command log
        $commandLog = CommandLog::create([
            'command_id' => $commandId,
            'user_id' => $user->id,
            'target_type' => $targetType,
            'target_id' => $targetId,
            'action' => $action,
            'params' => $params,
            'reason' => $reason,
            'issued_at' => $issuedAt,
            'ttl_seconds' => $ttlSeconds,
            'source' => 'manual',
        ]);

        // Create pending results and dispatch via MQTT
        $mqttPayload = [
            'command_id' => $commandId,
            'action' => $action,
            'params' => $params,
            'issued_at' => $issuedAt->timestamp,
            'ttl_seconds' => $ttlSeconds,
        ];

        foreach ($pcs as $pc) {
            CommandResult::create([
                'command_log_id' => $commandLog->id,
                'pc_id' => $pc->id,
                'status' => 'pending',
            ]);

            // Publish command via MQTT
            if ($action === 'wake') {
                // Wake handled separately via relay
                continue;
            }

            MqttPublisher::publish(
                "simlab/{$pc->lab->slug}/{$pc->slug}/command",
                $mqttPayload
            );
        }

        // Handle wake action via relay
        if ($action === 'wake') {
            $macsByLab = $pcs->groupBy('lab_id');
            foreach ($macsByLab as $labId => $labPcs) {
                $lab = Lab::find($labId);
                $macs = $labPcs->where('wol_enabled', true)->pluck('mac_address')->toArray();
                if (!empty($macs)) {
                    MqttPublisher::publish(
                        "simlab/{$lab->slug}/relay/wake",
                        ['macs' => $macs, 'command_id' => $commandId]
                    );
                }
            }
        }

        return response()->json([
            'message' => "Perintah '{$action}' terkirim ke {$pcs->count()} PC.",
            'data' => [
                'command_id' => $commandId,
                'action' => $action,
                'target_count' => $pcs->count(),
                'issued_at' => $issuedAt->toIso8601String(),
            ],
        ], Response::HTTP_CREATED);
    }

    /**
     * GET /api/commands — List command history.
     */
    public function index(Request $request): JsonResponse
    {
        $perPage = min($request->query('per_page', 25), 100);

        $query = CommandLog::with([
            'user:id,name', 
            'results.pc:id,hostname,slug',
            'results:id,command_log_id,pc_id,status,output,error_message,executed_at'
        ])
            ->orderByDesc('issued_at');

        // Filter by lab
        if ($labId = $request->query('lab_id')) {
            $query->where(function ($q) use ($labId) {
                $q->where('target_type', 'lab')->where('target_id', $labId)
                    ->orWhereHas('results', fn($rq) => $rq->whereHas('pc', fn($pq) => $pq->where('lab_id', $labId)));
            });
        }

        // Filter by action
        if ($action = $request->query('action')) {
            $query->where('action', $action);
        }

        // Filter by date range
        if ($from = $request->query('from')) {
            $query->where('issued_at', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $query->where('issued_at', '<=', $to);
        }

        // Restrict operators to their labs' commands
        $user = $request->user();
        if ($user->isOperator()) {
            $labIds = $user->labs()->pluck('labs.id');
            $query->where(function ($q) use ($labIds) {
                $q->where('target_type', 'lab')->whereIn('target_id', $labIds)
                    ->orWhere('target_type', 'pc')
                    ->whereIn('target_id', Pc::whereIn('lab_id', $labIds)->pluck('id'));
            });
        }

        return response()->json($query->paginate($perPage));
    }

    /**
     * GET /api/commands/{commandLog} — Command detail with per-PC results.
     */
    public function show(Request $request, int $commandLog): JsonResponse
    {
        $log = CommandLog::with([
            'user:id,name',
            'results.pc:id,hostname,slug,lab_id',
        ])->findOrFail($commandLog);

        return response()->json([
            'data' => $log,
        ]);
    }

    /**
     * GET /api/commands/export — Export command logs as CSV.
     */
    public function export(Request $request): StreamedResponse
    {
        $query = CommandLog::with(['user:id,name', 'results.pc:id,hostname,slug'])
            ->orderByDesc('issued_at');

        if ($from = $request->query('from')) {
            $query->where('issued_at', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $query->where('issued_at', '<=', $to);
        }
        if ($labId = $request->query('lab_id')) {
            $query->where('target_type', 'lab')->where('target_id', $labId);
        }

        $logs = $query->limit(5000)->get();

        return response()->streamDownload(function () use ($logs) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, [
                'Command ID', 'Waktu', 'Pelaku', 'Aksi', 'Target',
                'Alasan', 'Sumber', 'Jumlah PC', 'Status',
            ]);

            foreach ($logs as $log) {
                $statusSummary = $log->results->groupBy('status')
                    ->map(fn($g, $s) => "$s:{$g->count()}")
                    ->implode(', ');

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
        }, 'command-logs-' . now()->format('Ymd-His') . '.csv', [
            'Content-Type' => 'text/csv',
        ]);
    }

    /**
     * Resolve target PCs based on target type.
     */
    private function resolveTargetPCs($user, string $targetType, ?int $targetId)
    {
        $query = Pc::query();

        switch ($targetType) {
            case 'pc':
                $query->where('id', $targetId);
                break;
            case 'lab':
                // Check access
                if (!$user->hasLabAccess($targetId)) {
                    return collect();
                }
                $query->where('lab_id', $targetId);
                break;
            case 'all':
                if (!$user->isSuperAdmin()) {
                    $labIds = $user->labs()->pluck('labs.id');
                    $query->whereIn('lab_id', $labIds);
                }
                break;
        }

        return $query->with('lab:id,slug')->get();
    }
}
