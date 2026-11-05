<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CommandLog;
use App\Models\CommandResult;
use App\Models\Lab;
use App\Models\Metric;
use App\Models\Pc;
use App\Models\PowerEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class TelemetryIngestController extends Controller
{
    /**
     * Ingest telemetry from an authenticated agent and return pending commands.
     */
    public function ingest(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'lab_id' => 'required|string|max:100',
            'pc_id' => 'required|string|max:100',
            'sample_id' => 'nullable|string|max:64',
            'timestamp' => 'nullable|integer',
            'hostname' => 'nullable|string|max:255',
            'status' => 'nullable|string|max:50',
            'version' => 'nullable|string|max:50',
            'agent_version' => 'nullable|string|max:50',
            'ip_address' => 'nullable|ip',
            'mac_address' => 'nullable|string|max:32',
            'uptime' => 'nullable|integer|min:0',
            'uptime_seconds' => 'nullable|integer|min:0',
            'metrics' => 'nullable|array',
            'metrics.cpu_percent' => 'nullable|numeric',
            'metrics.ram_percent' => 'nullable|numeric',
            'metrics.disk_percent' => 'nullable|numeric',
            'metrics.cpu_usage_pct' => 'nullable|numeric',
            'metrics.ram_used_bytes' => 'nullable|numeric',
            'metrics.ram_total_bytes' => 'nullable|numeric',
            'metrics.disk_used_bytes' => 'nullable|numeric',
            'metrics.disk_total_bytes' => 'nullable|numeric',
            'metrics.network_rx_bytes' => 'nullable|numeric',
            'metrics.network_tx_bytes' => 'nullable|numeric',
        ]);

        $lab = Lab::where('slug', Str::slug($validated['lab_id']))->first();

        // Compatibility for agents installed with the old "lab1".."lab4"
        // config template. Prefer a real slug when one exists.
        if (! $lab) {
            $aliases = [
                'lab1' => 'lab-rpl-1', 'lab-1' => 'lab-rpl-1', 'rpl1' => 'lab-rpl-1',
                'lab2' => 'lab-rpl-2', 'lab-2' => 'lab-rpl-2', 'rpl2' => 'lab-rpl-2',
                'lab3' => 'lab-rpl-3', 'lab-3' => 'lab-rpl-3', 'rpl3' => 'lab-rpl-3',
                'lab4' => 'lab-rpl-4', 'lab-4' => 'lab-rpl-4', 'rpl4' => 'lab-rpl-4',
                'bahasa' => 'lab-bahasa', 'rps' => 'lab-rps',
            ];
            $alias = $aliases[Str::slug($validated['lab_id'])] ?? null;
            if ($alias) {
                $lab = Lab::where('slug', $alias)->first();
            }
        }

        if (! $lab) {
            Log::warning('Telemetry rejected: unknown lab', [
                'lab_id' => $validated['lab_id'],
                'pc_id' => $validated['pc_id'],
                'hostname' => $validated['hostname'] ?? null,
                'ip_address' => $request->ip(),
            ]);

            return response()->json(['message' => 'Lab tidak dikenal.'], 404);
        }

        $pcSlug = Str::slug($validated['pc_id']);
        $hostname = $validated['hostname'] ?? strtoupper($validated['pc_id']);
        $pc = Pc::where('lab_id', $lab->id)
            ->where(function ($query) use ($pcSlug, $hostname) {
                $query->where('slug', $pcSlug)->orWhere('hostname', $hostname);
            })
            ->first();

        if (! $pc) {
            Log::warning('Telemetry rejected: unknown pc', [
                'lab_id' => $lab->slug,
                'pc_id' => $validated['pc_id'],
                'hostname' => $validated['hostname'] ?? null,
                'ip_address' => $request->ip(),
            ]);

            return response()->json(['message' => 'PC tidak dikenal di lab ini.'], 404);
        }

        $oldStatus = $pc->status;
        $newStatus = $validated['status'] ?? 'online';
        $recordedAt = isset($validated['timestamp'])
            ? Carbon::createFromTimestampUTC($validated['timestamp'])
            : now();

        if ($pc->last_seen_at === null || $recordedAt->greaterThanOrEqualTo($pc->last_seen_at)) {
            $pc->update([
                'status' => $newStatus,
                'ip_address' => $validated['ip_address'] ?? $pc->ip_address,
                'mac_address' => ! empty($validated['mac_address']) ? $validated['mac_address'] : $pc->mac_address,
                'agent_version' => $validated['agent_version'] ?? $validated['version'] ?? $pc->agent_version,
                'last_seen_at' => $recordedAt,
            ]);

            if ($oldStatus !== 'online' && $newStatus === 'online') {
                PowerEvent::create([
                    'pc_id' => $pc->id,
                    'event_type' => 'boot',
                    'source' => 'agent',
                    'created_at' => $recordedAt,
                ]);
            }
        }

        if (! empty($validated['metrics'])) {
            $m = $validated['metrics'];
            $cpuPct = $m['cpu_percent'] ?? $m['cpu_usage_pct'] ?? 0;
            $ramPct = $m['ram_percent'] ?? 0;
            if ($ramPct == 0 && ! empty($m['ram_total_bytes']) && $m['ram_total_bytes'] > 0) {
                $ramPct = round(($m['ram_used_bytes'] / $m['ram_total_bytes']) * 100, 2);
            }
            $diskPct = $m['disk_percent'] ?? 0;
            if ($diskPct == 0 && ! empty($m['disk_total_bytes']) && $m['disk_total_bytes'] > 0) {
                $diskPct = round(($m['disk_used_bytes'] / $m['disk_total_bytes']) * 100, 2);
            }

            $metric = [
                'pc_id' => $pc->id,
                'sample_id' => $validated['sample_id'] ?? null,
                'cpu_percent' => $cpuPct,
                'ram_percent' => $ramPct,
                'disk_percent' => $diskPct,
                'uptime_seconds' => $validated['uptime_seconds'] ?? $validated['uptime'] ?? 0,
                'recorded_at' => $recordedAt,
            ];

            if ($metric['sample_id']) {
                Metric::insertOrIgnore([$metric]);
            } else {
                Metric::create($metric);
            }
        }

        $pendingResults = CommandResult::with('commandLog')
            ->where('pc_id', $pc->id)
            ->where('status', 'pending')
            ->get();

        $commandsToSend = [];
        foreach ($pendingResults as $res) {
            $log = $res->commandLog;
            if (! $log) {
                continue;
            }

            if ($log->issued_at->copy()->addSeconds($log->ttl_seconds)->isPast()) {
                $res->update([
                    'status' => 'rejected_expired',
                    'error_message' => 'Command expired before execution',
                ]);

                continue;
            }

            $commandsToSend[] = [
                'command_id' => $log->command_id,
                'action' => $log->action,
                // Go agents expect a JSON object. PHP encodes an empty array
                // as [], which makes older agents reject the whole response.
                'params' => (object) ($log->params ?? []),
                'issued_at' => $log->issued_at->timestamp,
                'ttl_seconds' => $log->ttl_seconds,
            ];

            $res->update(['status' => 'delivered', 'delivered_at' => now()]);
        }

        return response()->json([
            'status' => 'ok',
            'pc_id' => $pc->id,
            'lab_id' => $pc->lab_id,
            'hostname' => $pc->hostname,
            'state' => $pc->status,
            'commands' => $commandsToSend,
        ]);
    }

    /**
     * Receive a command acknowledgment from an authenticated agent.
     */
    public function ack(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'command_id' => 'required|string',
            // New agents send the numeric database ID; agents installed before
            // the token rollout send their hostname or slug.
            'pc_id' => 'required|max:100',
            'hostname' => 'nullable|string|max:255',
            'status' => 'required|string|in:delivered,executed,failed,rejected_expired,rejected_duplicate,rejected_unknown,timeout',
            'message' => 'nullable|string|max:10000',
            'output' => 'nullable|string|max:100000',
            'exit_code' => 'nullable|integer',
        ]);

        $log = CommandLog::where('command_id', $validated['command_id'])->first();
        if (! $log) {
            return response()->json(['message' => 'Command log not found'], 404);
        }

        if (! is_scalar($validated['pc_id'])) {
            return response()->json(['message' => 'PC tidak dikenal.'], 404);
        }

        $query = CommandResult::where('command_log_id', $log->id);

        if (is_numeric($validated['pc_id'])) {
            $query->where('pc_id', (int) $validated['pc_id']);
        } else {
            $identity = $validated['hostname'] ?? (string) $validated['pc_id'];
            $pc = Pc::where('hostname', $identity)
                ->orWhere('slug', Str::slug($identity))
                ->first();

            // Legacy teacher agents identify themselves as "komguru".
            if (! $pc && str_contains(strtolower($identity), 'guru')) {
                $pc = Pc::where('hostname', 'like', '%KOMGURU%')->first();
            }

            if (! $pc) {
                return response()->json(['message' => 'PC tidak dikenal.'], 404);
            }

            $query->where('pc_id', $pc->id);
        }

        $result = $query->first();

        if (! $result) {
            return response()->json(['message' => 'Command result tidak cocok dengan PC.'], 404);
        }

        if (in_array($result->status, ['executed', 'failed', 'rejected_expired', 'rejected_duplicate', 'rejected_unknown', 'timeout'], true)) {
            return response()->json(['status' => 'ok', 'updated' => false]);
        }

        $status = $validated['status'];
        $isTerminal = $status !== 'delivered';
        $result->update([
            'status' => $status,
            'output' => $validated['output'] ?? null,
            'error_message' => $validated['message'] ?? null,
            'delivered_at' => $status === 'delivered' ? now() : $result->delivered_at,
            'executed_at' => $isTerminal ? now() : null,
        ]);

        return response()->json(['status' => 'ok', 'updated' => true]);
    }
}
