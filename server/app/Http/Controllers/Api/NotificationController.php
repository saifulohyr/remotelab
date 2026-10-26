<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /**
     * GET /api/notifications — List notifications for the user's labs.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $perPage = min($request->query('per_page', 20), 100);

        $query = Notification::with('pc:id,hostname,slug')
            ->orderByDesc('created_at');

        if ($user->isOperator()) {
            $labIds = $user->labs()->pluck('labs.id');
            $query->whereIn('lab_id', $labIds);
        }

        if ($request->query('unread_only')) {
            $query->where('is_read', false);
        }

        return response()->json($query->paginate($perPage));
    }

    /**
     * GET /api/notifications/unread-count — Count of unread notifications.
     */
    public function unreadCount(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = Notification::where('is_read', false);

        if ($user->isOperator()) {
            $labIds = $user->labs()->pluck('labs.id');
            $query->whereIn('lab_id', $labIds);
        }

        return response()->json([
            'count' => $query->count(),
        ]);
    }

    /**
     * POST /api/notifications/{notification}/read — Mark notification as read.
     */
    public function markRead(int $notification): JsonResponse
    {
        Notification::where('id', $notification)->update(['is_read' => true]);

        return response()->json(['message' => 'Notifikasi telah dibaca.']);
    }

    /**
     * POST /api/notifications/read-all — Mark all notifications as read.
     */
    public function markAllRead(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = Notification::where('is_read', false);
        if ($user->isOperator()) {
            $labIds = $user->labs()->pluck('labs.id');
            $query->whereIn('lab_id', $labIds);
        }

        $query->update(['is_read' => true]);

        return response()->json(['message' => 'Semua notifikasi telah dibaca.']);
    }
}
