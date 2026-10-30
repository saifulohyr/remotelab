<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CommandController;
use App\Http\Controllers\Api\InternalBroadcastController;
use App\Http\Controllers\Api\LabController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PcController;
use App\Http\Controllers\Api\ScheduleController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes — SIMLab
|--------------------------------------------------------------------------
*/

// ── Public (unauthenticated) ──────────────────────────────
Route::post('/login', [AuthController::class, 'login']);
Route::post('/telemetry', [\App\Http\Controllers\Api\TelemetryIngestController::class, 'ingest']);
Route::post('/commands/ack', [\App\Http\Controllers\Api\TelemetryIngestController::class, 'ack']);

// ── Internal (worker → Laravel, token-protected) ──────────
Route::post('/internal/broadcast', [InternalBroadcastController::class, 'handle']);

// ── Authenticated routes ──────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {

    // Auth
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // Labs
    Route::get('/labs', [LabController::class, 'index']);
    Route::get('/labs/{lab}', [LabController::class, 'show'])
        ->middleware('lab.access');
    Route::get('/labs/{lab}/pcs', [LabController::class, 'pcs'])
        ->middleware('lab.access');

    // PCs
    Route::get('/pcs/{pc}', [PcController::class, 'show']);
    Route::get('/pcs/{pc}/metrics', [PcController::class, 'metrics']);
    Route::get('/pcs/{pc}/events', [PcController::class, 'events']);

    // Commands
    Route::get('/commands', [CommandController::class, 'index']);
    Route::post('/commands', [CommandController::class, 'store']);
    Route::get('/commands/export', [CommandController::class, 'export']);
    Route::get('/commands/{commandLog}', [CommandController::class, 'show']);

    // Schedules
    Route::get('/labs/{lab}/schedules', [ScheduleController::class, 'index'])
        ->middleware('lab.access');
    Route::post('/labs/{lab}/schedules', [ScheduleController::class, 'store'])
        ->middleware('lab.access');
    Route::delete('/labs/{lab}/schedules/{schedule}', [ScheduleController::class, 'destroy'])
        ->middleware('lab.access');

    // Schedule Exceptions
    Route::get('/labs/{lab}/schedule-exceptions', [ScheduleController::class, 'exceptions'])
        ->middleware('lab.access');
    Route::post('/labs/{lab}/schedule-exceptions', [ScheduleController::class, 'storeException'])
        ->middleware('lab.access');
    Route::delete('/labs/{lab}/schedule-exceptions/{exception}', [ScheduleController::class, 'destroyException'])
        ->middleware('lab.access');

    // Notifications
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
});
