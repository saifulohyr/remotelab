<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lab;
use App\Models\Schedule;
use App\Models\ScheduleException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ScheduleController extends Controller
{
    /**
     * GET /api/labs/{lab}/schedules — List schedules for a lab.
     */
    public function index(int $lab): JsonResponse
    {
        $schedules = Schedule::where('lab_id', $lab)
            ->orderBy('day_of_week')
            ->get();

        return response()->json([
            'data' => $schedules,
        ]);
    }

    /**
     * POST /api/labs/{lab}/schedules — Create or update a schedule.
     */
    public function store(Request $request, int $lab): JsonResponse
    {
        $request->validate([
            'day_of_week' => 'required|integer|between:0,6',
            'wake_time' => 'nullable|date_format:H:i',
            'shutdown_time' => 'nullable|date_format:H:i',
            'is_active' => 'boolean',
        ]);

        $schedule = Schedule::updateOrCreate(
            ['lab_id' => $lab, 'day_of_week' => $request->day_of_week],
            $request->only(['wake_time', 'shutdown_time', 'is_active'])
        );

        return response()->json([
            'message' => 'Jadwal berhasil disimpan.',
            'data' => $schedule,
        ]);
    }

    /**
     * DELETE /api/labs/{lab}/schedules/{schedule} — Delete a schedule.
     */
    public function destroy(int $lab, int $schedule): JsonResponse
    {
        Schedule::where('lab_id', $lab)->where('id', $schedule)->delete();

        return response()->json([
            'message' => 'Jadwal berhasil dihapus.',
        ]);
    }

    /**
     * GET /api/labs/{lab}/schedule-exceptions — List exceptions.
     */
    public function exceptions(int $lab): JsonResponse
    {
        $exceptions = ScheduleException::where('lab_id', $lab)
            ->where('exception_date', '>=', now()->subMonth())
            ->orderBy('exception_date')
            ->get();

        return response()->json([
            'data' => $exceptions,
        ]);
    }

    /**
     * POST /api/labs/{lab}/schedule-exceptions — Create an exception.
     */
    public function storeException(Request $request, int $lab): JsonResponse
    {
        $request->validate([
            'exception_date' => 'required|date',
            'type' => 'required|in:skip,override',
            'wake_time' => 'nullable|date_format:H:i',
            'shutdown_time' => 'nullable|date_format:H:i',
            'reason' => 'nullable|string|max:500',
        ]);

        $exception = ScheduleException::updateOrCreate(
            ['lab_id' => $lab, 'exception_date' => $request->exception_date],
            $request->only(['type', 'wake_time', 'shutdown_time', 'reason'])
        );

        return response()->json([
            'message' => 'Exception jadwal berhasil disimpan.',
            'data' => $exception,
        ]);
    }

    /**
     * DELETE /api/labs/{lab}/schedule-exceptions/{exception} — Delete exception.
     */
    public function destroyException(int $lab, int $exception): JsonResponse
    {
        ScheduleException::where('lab_id', $lab)->where('id', $exception)->delete();

        return response()->json([
            'message' => 'Exception jadwal berhasil dihapus.',
        ]);
    }
}
