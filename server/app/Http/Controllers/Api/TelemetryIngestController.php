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
use Illuminate\Support\Str;

class TelemetryIngestController extends Controller
{
    /**
     * Ingest telemetry from agent and return any pending commands for this PC.
     */
    public function ingest(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'lab_id' => 'required|string',
            'pc_id' => 'required|string',
            'hostname' => 'nullable|string',
            'status' => 'nullable|string',
            'version' => 'nullable|string',
            'ip_address' => 'nullable|string',
            'mac_address' => 'nullable|string',
            'uptime' => 'nullable|integer',
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

        $labSlug = Str::slug($validated['lab_id']);
        $pcSlug = Str::slug($validated['pc_id']);
        $hostname = $validated['hostname'] ?? strtoupper($validated['pc_id']);

        // Find or fallback lab
        $lab = Lab::where('slug', $labSlug)
            ->orWhere('name', 'like', "%{$validated['lab_id']}%")
            ->first();

        if (!$lab) {
            $lab = Lab::first();
        }

        // Find or auto-create PC
        $pc = Pc::where(function ($query) use ($pcSlug, $hostname, $lab) {
            $query->where('lab_id', $lab ? $lab->id : 1)
                  ->where(function ($q) use ($pcSlug, $hostname) {
                      $q->where('slug', $pcSlug)
                        ->orWhere('hostname', $hostname);
                  });
        })->first();

        if (!$pc) {
            $mac = !empty($validated['mac_address']) ? $validated['mac_address'] : sprintf('02:00:00:%02x:%02x:%02x', $lab ? $lab->id : 1, rand(1, 250), rand(1, 250));
            $pc = Pc::create([
                'lab_id' => $lab ? $lab->id : 1,
                'hostname' => $hostname,
                'slug' => $pcSlug,
                'mac_address' => $mac,
                'status' => 'online',
                'ip_address' => $validated['ip_address'] ?? $request->ip(),
                'agent_version' => $validated['version'] ?? '1.0.0',
                'last_seen_at' => now(),
            ]);
            PowerEvent::create([
                'pc_id' => $pc->id,
                'event_type' => 'boot',
                'source' => 'agent',
                'created_at' => now(),
            ]);
        } else {
            $oldStatus = $pc->status;
            $newStatus = $validated['status'] ?? 'online';

            $pc->update([
                'status' => $newStatus,
                'ip_address' => $validated['ip_address'] ?? $request->ip(),
                'mac_address' => !empty($validated['mac_address']) ? $validated['mac_address'] : $pc->mac_address,
                'agent_version' => $validated['version'] ?? $pc->agent_version,
                'last_seen_at' => now(),
            ]);

            if ($oldStatus !== 'online' && $newStatus === 'online') {
                PowerEvent::create([
                    'pc_id' => $pc->id,
                    'event_type' => 'boot',
                    'source' => 'agent',
                    'created_at' => now(),
                ]);
            }
        }

        // Save metrics if present
        if (!empty($validated['metrics'])) {
            $m = $validated['metrics'];
            $cpuPct = $m['cpu_percent'] ?? $m['cpu_usage_pct'] ?? 0;
            $ramPct = $m['ram_percent'] ?? 0;
            if ($ramPct == 0 && !empty($m['ram_total_bytes']) && $m['ram_total_bytes'] > 0) {
                $ramPct = round(($m['ram_used_bytes'] / $m['ram_total_bytes']) * 100, 2);
            }
            $diskPct = $m['disk_percent'] ?? 0;
            if ($diskPct == 0 && !empty($m['disk_total_bytes']) && $m['disk_total_bytes'] > 0) {
                $diskPct = round(($m['disk_used_bytes'] / $m['disk_total_bytes']) * 100, 2);
            }
            Metric::create([
                'pc_id' => $pc->id,
                'cpu_percent' => $cpuPct,
                'ram_percent' => $ramPct,
                'disk_percent' => $diskPct,
                'uptime_seconds' => $validated['uptime'] ?? 0,
                'recorded_at' => now(),
            ]);
        }

        // Fetch pending commands for this PC
        $pendingResults = CommandResult::with('commandLog')
            ->where('pc_id', $pc->id)
            ->where('status', 'pending')
            ->get();

        $commandsToSend = [];
        foreach ($pendingResults as $res) {
            $log = $res->commandLog;
            if (!$log) {
                continue;
            }

            // Check TTL
            $isExpired = $log->issued_at->addSeconds($log->ttl_seconds)->isPast();
            if ($isExpired) {
                $res->update([
                    'status' => 'rejected_expired',
                    'error_message' => 'Command expired before execution',
                ]);
                continue;
            }

            $commandsToSend[] = [
                'command_id' => $log->command_id,
                'action' => $log->action,
                'params' => $log->params ?? [],
                'issued_at' => $log->issued_at->timestamp,
                'ttl_seconds' => $log->ttl_seconds,
            ];

            $res->update([
                'status' => 'delivered',
                'delivered_at' => now(),
            ]);
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
     * Receive command acknowledgment from agent (HTTP fallback).
     */
    public function ack(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'command_id' => 'required|string',
            'pc_id' => 'nullable',
            'hostname' => 'nullable|string',
            'status' => 'required|string|in:delivered,executed,failed,rejected_expired,rejected_duplicate,rejected_unknown,timeout',
            'message' => 'nullable|string',
            'output' => 'nullable|string',
            'exit_code' => 'nullable|integer',
        ]);

        $log = CommandLog::where('command_id', $validated['command_id'])->first();
        if (!$log) {
            return response()->json(['message' => 'Command log not found'], 404);
        }

        $query = CommandResult::where('command_log_id', $log->id);

        if (!empty($validated['pc_id']) && is_numeric($validated['pc_id'])) {
            $query->where('pc_id', (int) $validated['pc_id']);
        } elseif (!empty($validated['hostname'])) {
            $pc = Pc::where('hostname', $validated['hostname'])->first();
            if ($pc) {
                $query->where('pc_id', $pc->id);
            }
        }

        $result = $query->first();
        if ($result) {
            $outputMsg = $validated['output'] ?? $validated['message'] ?? null;
            $result->update([
                'status' => $validated['status'],
                'output' => $outputMsg,
                'error_message' => ($validated['status'] === 'failed' || !empty($validated['exit_code']) && $validated['exit_code'] !== 0) ? ($validated['message'] ?: $outputMsg) : null,
                'executed_at' => now(),
            ]);
        }

        return response()->json(['status' => 'ok', 'updated' => (bool) $result]);
    }
}
