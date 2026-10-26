<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Metric;
use App\Models\MetricMinute;
use App\Models\Pc;
use App\Models\PowerEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PcController extends Controller
{
    /**
     * GET /api/pcs/{pc} — PC detail with latest metrics.
     */
    public function show(Request $request, int $pc): JsonResponse
    {
        $pcModel = Pc::with('lab:id,name,slug')->findOrFail($pc);

        // Check lab access for operator
        $user = $request->user();
        if ($user->isOperator() && !$user->hasLabAccess($pcModel->lab_id)) {
            return response()->json(['message' => 'Akses ditolak.'], 403);
        }

        // Get latest telemetry
        $latestMetric = Metric::where('pc_id', $pc)
            ->orderByDesc('recorded_at')
            ->first();

        return response()->json([
            'data' => [
                'id' => $pcModel->id,
                'hostname' => $pcModel->hostname,
                'slug' => $pcModel->slug,
                'lab' => $pcModel->lab,
                'mac_address' => $pcModel->mac_address,
                'ip_address' => $pcModel->ip_address,
                'status' => $pcModel->status,
                'status_color' => $pcModel->status_color,
                'last_seen_at' => $pcModel->last_seen_at?->toIso8601String(),
                'agent_version' => $pcModel->agent_version,
                'wol_enabled' => $pcModel->wol_enabled,
                'last_wake_at' => $pcModel->last_wake_at?->toIso8601String(),
                'description' => $pcModel->description,
                'latest_metrics' => $latestMetric ? [
                    'cpu_percent' => $latestMetric->cpu_percent,
                    'ram_percent' => $latestMetric->ram_percent,
                    'disk_percent' => $latestMetric->disk_percent,
                    'uptime_seconds' => $latestMetric->uptime_seconds,
                    'recorded_at' => $latestMetric->recorded_at->toIso8601String(),
                ] : null,
            ],
        ]);
    }

    /**
     * GET /api/pcs/{pc}/metrics — Historical metrics for charting.
     *
     * Query params:
     *   range: 1h, 6h, 24h, 7d, 30d (default: 1h)
     */
    public function metrics(Request $request, int $pc): JsonResponse
    {
        $range = $request->query('range', '1h');

        // Determine time range and data source
        [$startTime, $useAggregated] = match ($range) {
            '1h' => [now()->subHour(), false],
            '6h' => [now()->subHours(6), true],
            '24h' => [now()->subDay(), true],
            '7d' => [now()->subWeek(), true],
            '30d' => [now()->subMonth(), true],
            default => [now()->subHour(), false],
        };

        if ($useAggregated) {
            // Use minute-level aggregated data
            $data = MetricMinute::where('pc_id', $pc)
                ->where('minute_at', '>=', $startTime)
                ->orderBy('minute_at')
                ->get()
                ->map(fn($m) => [
                    'timestamp' => $m->minute_at->toIso8601String(),
                    'cpu' => round($m->avg_cpu, 1),
                    'cpu_max' => round($m->max_cpu, 1),
                    'ram' => round($m->avg_ram, 1),
                    'ram_max' => round($m->max_ram, 1),
                    'disk' => round($m->avg_disk, 1),
                ]);
        } else {
            // Use raw telemetry data for short ranges
            $data = Metric::where('pc_id', $pc)
                ->where('recorded_at', '>=', $startTime)
                ->orderBy('recorded_at')
                ->get()
                ->map(fn($m) => [
                    'timestamp' => $m->recorded_at->toIso8601String(),
                    'cpu' => round($m->cpu_percent, 1),
                    'ram' => round($m->ram_percent, 1),
                    'disk' => round($m->disk_percent, 1),
                    'uptime' => $m->uptime_seconds,
                ]);
        }

        return response()->json([
            'data' => $data,
            'meta' => [
                'range' => $range,
                'aggregated' => $useAggregated,
                'start' => $startTime->toIso8601String(),
                'end' => now()->toIso8601String(),
                'count' => $data->count(),
            ],
        ]);
    }

    /**
     * GET /api/pcs/{pc}/events — Power events and command log history.
     */
    public function events(Request $request, int $pc): JsonResponse
    {
        $perPage = min($request->query('per_page', 25), 100);

        $events = PowerEvent::where('pc_id', $pc)
            ->with('user:id,name')
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return response()->json($events);
    }
}
