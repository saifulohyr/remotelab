<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification as AppNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Internal endpoint called by the Go MQTT worker to trigger broadcasts and store notifications.
 * Protected by a shared API token (X-Internal-Token header).
 */
class InternalBroadcastController extends Controller
{
    /**
     * POST /api/internal/broadcast — Receive events from the Go worker.
     */
    public function handle(Request $request): JsonResponse
    {
        // Validate internal token
        $token = $request->header('X-Internal-Token');
        if ($token !== config('services.internal.token')) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $type = $request->input('type');
        $channel = $request->input('channel');
        $data = $request->input('data');

        // Store notification events in database
        if ($type === 'notification') {
            $labSlug = str_replace('lab.', '', $channel);
            $lab = \App\Models\Lab::where('slug', $labSlug)->first();

            if ($lab) {
                AppNotification::create([
                    'lab_id' => $lab->id,
                    'pc_id' => $data['pc_id'] ?? null,
                    'type' => $data['type'] ?? 'unknown',
                    'message' => $data['message'] ?? '',
                    'data' => $data,
                    'created_at' => now(),
                ]);
            }
        }

        // TODO: Broadcast via Reverb when set up
        // event(new \App\Events\BroadcastEvent($type, $channel, $data));

        return response()->json(['status' => 'ok']);
    }
}
