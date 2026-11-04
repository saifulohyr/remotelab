<?php

namespace App\Console\Commands;

use App\Models\CommandLog;
use App\Models\CommandResult;
use App\Models\Lab;
use App\Models\PowerEvent;
use App\Models\Schedule;
use App\Models\ScheduleException;
use App\Services\MqttPublisher;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class CheckLabSchedules extends Command
{
    protected $signature = 'simlab:check-schedules {--force : Paksa eksekusi tanpa mencocokkan menit saat ini}';

    protected $description = 'Periksa dan eksekusi jadwal otomatis daya (WoL & Shutdown) laboratorium SIMLab';

    public function handle(MqttPublisher $mqtt): int
    {
        $now = now(config('services.simlab.timezone', 'Asia/Jakarta'));
        $this->info("Menjalankan pengecekan jadwal SIMLab pada {$now->toDateTimeString()}");

        foreach (Lab::with('pcs')->get() as $lab) {
            $this->processLabSchedule($lab, $now, (bool) $this->option('force'), $mqtt);
        }

        return Command::SUCCESS;
    }

    protected function processLabSchedule(Lab $lab, Carbon $now, bool $force, MqttPublisher $mqtt): void
    {
        $exception = ScheduleException::where('lab_id', $lab->id)
            ->whereDate('exception_date', $now->toDateString())
            ->first();

        if ($exception?->type === 'skip') {
            $this->line("[Lab {$lab->name}] Dilewati karena schedule exception.");

            return;
        }

        if ($exception?->type === 'override') {
            $wakeTime = $exception->wake_time ? substr($exception->wake_time, 0, 5) : null;
            $shutdownTime = $exception->shutdown_time ? substr($exception->shutdown_time, 0, 5) : null;
        } else {
            $schedule = Schedule::where('lab_id', $lab->id)
                ->where('day_of_week', $now->dayOfWeek)
                ->where('is_active', true)
                ->first();
            if (! $schedule) {
                return;
            }
            $wakeTime = $schedule->wake_time ? substr($schedule->wake_time, 0, 5) : null;
            $shutdownTime = $schedule->shutdown_time ? substr($schedule->shutdown_time, 0, 5) : null;
        }

        $currentTime = $now->format('H:i');
        if ($wakeTime && ($wakeTime === $currentTime || $force)) {
            $this->executeWake($lab, $now, $mqtt);
        }
        if ($shutdownTime && ($shutdownTime === $currentTime || $force)) {
            $this->executeShutdown($lab, $now, $mqtt);
        }
    }

    private function alreadyDispatched(Lab $lab, string $action, Carbon $now): bool
    {
        return CommandLog::where('source', 'schedule')
            ->where('target_type', 'lab')
            ->where('target_id', $lab->id)
            ->where('action', $action)
            ->whereDate('issued_at', $now->toDateString())
            ->exists();
    }

    protected function executeWake(Lab $lab, Carbon $issuedAt, MqttPublisher $mqtt): void
    {
        if ($this->alreadyDispatched($lab, 'wake', $issuedAt)) {
            $this->line("[Lab {$lab->name}] Wake hari ini sudah pernah didispatch.");

            return;
        }

        $pcs = $lab->pcs()->where('wol_enabled', true)->whereNotNull('mac_address')->get();
        if ($pcs->isEmpty()) {
            return;
        }

        $commandLog = CommandLog::create([
            'command_id' => (string) Str::uuid7(),
            'user_id' => null,
            'target_type' => 'lab',
            'target_id' => $lab->id,
            'action' => 'wake',
            'params' => ['pc_count' => $pcs->count(), 'schedule_date' => $issuedAt->toDateString()],
            'reason' => 'Otomasi Jadwal Nyala Lab Harian',
            'issued_at' => $issuedAt->copy()->utc(),
            'ttl_seconds' => 300,
            'source' => 'schedule',
        ]);
        foreach ($pcs as $pc) {
            CommandResult::create(['command_log_id' => $commandLog->id, 'pc_id' => $pc->id, 'status' => 'pending']);
        }

        $published = $mqtt->publish("simlab/{$lab->slug}/relay/wake", [
            'command_id' => $commandLog->command_id,
            'macs' => $pcs->pluck('mac_address')->values()->all(),
            'broadcast_ip' => $lab->subnet_broadcast ?? '255.255.255.255',
            'issued_at' => $issuedAt->timestamp,
            'ttl_seconds' => 300,
        ]);

        foreach ($pcs as $pc) {
            if (! $published) {
                CommandResult::where('command_log_id', $commandLog->id)->where('pc_id', $pc->id)->update([
                    'status' => 'failed', 'error_message' => 'MQTT publish failed',
                ]);
            } else {
                $pc->update(['last_wake_at' => $issuedAt]);
            }
            PowerEvent::create([
                'pc_id' => $pc->id,
                'event_type' => $published ? 'wake_sent' : 'wake_failed',
                'source' => 'schedule',
                'created_at' => $issuedAt,
            ]);
        }

        $this->{$published ? 'info' : 'error'}("[Lab {$lab->name}] Dispatch WoL ".($published ? 'berhasil' : 'gagal').'.');
        Log::info("[Scheduler] WoL dispatch for {$lab->slug}: ".($published ? 'published' : 'failed'));
    }

    protected function executeShutdown(Lab $lab, Carbon $issuedAt, MqttPublisher $mqtt): void
    {
        if ($this->alreadyDispatched($lab, 'shutdown', $issuedAt)) {
            $this->line("[Lab {$lab->name}] Shutdown hari ini sudah pernah didispatch.");

            return;
        }

        $pcs = $lab->pcs()->where('status', 'online')->get();
        if ($pcs->isEmpty()) {
            return;
        }

        $commandLog = CommandLog::create([
            'command_id' => (string) Str::uuid7(),
            'user_id' => null,
            'target_type' => 'lab',
            'target_id' => $lab->id,
            'action' => 'shutdown',
            'params' => ['pc_count' => $pcs->count(), 'schedule_date' => $issuedAt->toDateString()],
            'reason' => 'Otomasi Jadwal Mati Lab Harian',
            'issued_at' => $issuedAt->copy()->utc(),
            'ttl_seconds' => 300,
            'source' => 'schedule',
        ]);

        $publishedCount = 0;
        foreach ($pcs as $pc) {
            CommandResult::create(['command_log_id' => $commandLog->id, 'pc_id' => $pc->id, 'status' => 'pending']);
            $success = $mqtt->publish("simlab/{$lab->slug}/{$pc->slug}/command", [
                'command_id' => $commandLog->command_id,
                'action' => 'shutdown',
                'params' => [],
                'ttl_seconds' => 300,
                'issued_at' => $issuedAt->timestamp,
            ]);
            if ($success) {
                $publishedCount++;
            } else {
                CommandResult::where('command_log_id', $commandLog->id)->where('pc_id', $pc->id)->update([
                    'status' => 'failed', 'error_message' => 'MQTT publish failed',
                ]);
            }
        }

        $this->info("[Lab {$lab->name}] Shutdown dipublish ke {$publishedCount} PC; gagal ".($pcs->count() - $publishedCount).'.');
    }
}
