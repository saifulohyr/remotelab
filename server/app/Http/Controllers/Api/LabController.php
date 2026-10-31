<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lab;
use App\Models\Pc;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LabController extends Controller
{
    /**
     * GET /api/labs — List all labs the user has access to, with summary stats.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = Lab::query()->withCount([
            'pcs',
            'pcs as online_count' => fn($q) => $q->where('status', 'online'),
            'pcs as offline_count' => fn($q) => $q->whereIn('status', ['offline_normal', 'offline_abnormal']),
            'pcs as booting_count' => fn($q) => $q->where('status', 'booting'),
            'pcs as wake_failed_count' => fn($q) => $q->where('status', 'wake_failed'),
        ]);

        // Operators only see their assigned labs
        if ($user->isOperator()) {
            $query->whereHas('users', fn($q) => $q->where('users.id', $user->id));
        }

        $labs = $query->orderBy('name')->get();

        return response()->json([
            'data' => $labs,
        ]);
    }

    /**
     * GET /api/labs/{lab} — Lab detail with all PCs and their current status.
     */
    public function show(Request $request, int $lab): JsonResponse
    {
        $labModel = Lab::with(['pcs' => function ($q) {
            $q->orderBy('slug');
        }])->findOrFail($lab);

        // Add summary counts
        $pcs = $labModel->pcs;
        $labModel->setAttribute('summary', [
            'total_pcs' => $pcs->count(),
            'online_count' => $pcs->where('status', 'online')->count(),
            'offline_count' => $pcs->whereIn('status', ['offline_normal', 'offline_abnormal'])->count(),
            'booting_count' => $pcs->where('status', 'booting')->count(),
            'wake_failed_count' => $pcs->where('status', 'wake_failed')->count(),
            'avg_cpu' => null,
            'avg_ram' => null,
        ]);

        return response()->json([
            'data' => $labModel,
        ]);
    }

    /**
     * GET /api/labs/{lab}/pcs — List PCs in a lab with status and last metrics.
     */
    public function pcs(Request $request, int $lab): JsonResponse
    {
        $pcs = Pc::where('lab_id', $lab)
            ->get()
            ->map(function ($pc) {
                $isTeacher = str_contains(strtoupper($pc->hostname ?? ''), 'GURU')
                    || str_contains(strtolower($pc->slug ?? ''), 'guru')
                    || str_contains(strtoupper($pc->pc_code ?? ''), 'GURU');
                return [
                    'id' => $pc->id,
                    'hostname' => $pc->hostname,
                    'slug' => $pc->slug,
                    'pc_code' => $pc->pc_code,
                    'mac_address' => $pc->mac_address,
                    'ip_address' => $pc->ip_address,
                    'status' => $pc->status,
                    'status_color' => $pc->status_color,
                    'last_seen_at' => $pc->last_seen_at?->toIso8601String(),
                    'agent_version' => $pc->agent_version,
                    'wol_enabled' => $pc->wol_enabled,
                    'description' => $pc->description,
                    'is_teacher' => $isTeacher,
                    'role' => $isTeacher ? 'teacher' : 'student',
                ];
            })
            ->sort(function ($a, $b) {
                if ($a['is_teacher'] !== $b['is_teacher']) {
                    return $b['is_teacher'] ? 1 : -1;
                }
                return strcmp($a['slug'] ?? '', $b['slug'] ?? '');
            })
            ->values();

        return response()->json([
            'data' => $pcs,
        ]);
    }
}
