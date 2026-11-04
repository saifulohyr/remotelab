<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lab;
use App\Models\Notification as AppNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InternalBroadcastController extends Controller
{
    public function handle(Request $request): JsonResponse
    {
        $expected = config('services.internal.token');
        $provided = $request->header('X-Internal-Token', '');
        if (! is_string($expected) || $expected === '' || ! is_string($provided) || ! hash_equals($expected, $provided)) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $validated = $request->validate([
            'type' => 'required|string|max:100',
            'channel' => 'required|string|max:150',
            'data' => 'required|array',
            'data.pc_id' => 'nullable|integer',
            'data.type' => 'nullable|string|max:100',
            'data.message' => 'nullable|string|max:10000',
        ]);

        if ($validated['type'] === 'notification') {
            if (! str_starts_with($validated['channel'], 'lab.')) {
                return response()->json(['message' => 'Channel notifikasi tidak valid.'], 422);
            }

            $lab = Lab::where('slug', substr($validated['channel'], 4))->first();
            if (! $lab) {
                return response()->json(['message' => 'Lab tidak dikenal.'], 422);
            }

            $data = $validated['data'];
            AppNotification::create([
                'lab_id' => $lab->id,
                'pc_id' => $data['pc_id'] ?? null,
                'type' => $data['type'] ?? 'unknown',
                'message' => $data['message'] ?? '',
                'data' => $data,
                'created_at' => now(),
            ]);
        }

        return response()->json(['status' => 'ok']);
    }
}
