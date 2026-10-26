<?php

namespace App\Console\Commands;

use App\Models\CommandLog;
use App\Models\Lab;
use App\Models\Schedule;
use App\Models\ScheduleException;
use App\Services\MqttPublisher;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class CheckLabSchedules extends Command
{
    /**
     * The name and signature of the console command.
     */
    protected $signature = 'simlab:check-schedules {--force : Paksa eksekusi tanpa mencocokkan menit saat ini}';

    /**
     * The console command description.
     */
    protected $description = 'Periksa dan eksekusi jadwal otomatis daya (WoL & Shutdown) laboratorium SIMLab';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $now = now();
        $currentTime = $now->format('H:i');
        $todayDate = $now->toDateString();
        $dayOfWeek = $now->dayOfWeek; // 0 = Minggu, 6 = Sabtu
        $force = $this->option('force');

        $this->info("Menjalankan pengecekan jadwal SIMLab pada {$now->toDateTimeString()} (Hari {$dayOfWeek}, Jam {$currentTime})");

        $labs = Lab::with('pcs')->get();

        foreach ($labs as $lab) {
            $this->processLabSchedule($lab, $todayDate, $dayOfWeek, $currentTime, $force);
        }

        return Command::SUCCESS;
    }

    protected function processLabSchedule(Lab $lab, string $todayDate, int $dayOfWeek, string $currentTime, bool $force): void
    {
        // 1. Cek Exception hari ini
        $exception = ScheduleException::where('lab_id', $lab->id)
            ->whereDate('exception_date', $todayDate)
            ->first();

        $wakeTime = null;
        $shutdownTime = null;

        if ($exception) {
            if ($exception->type === 'skip') {
                $this->line("[Lab {$lab->name}] Dilewati hari ini karena jadwal libur/exception: {$exception->reason}");
                return;
            } elseif ($exception->type === 'override') {
                $wakeTime = $exception->wake_time ? substr($exception->wake_time, 0, 5) : null;
                $shutdownTime = $exception->shutdown_time ? substr($exception->shutdown_time, 0, 5) : null;
                $this->line("[Lab {$lab->name}] Menggunakan override exception: {$exception->reason}");
            }
        } else {
            // 2. Cek Jadwal Rutin Mingguan
            $schedule = Schedule::where('lab_id', $lab->id)
                ->where('day_of_week', $dayOfWeek)
                ->where('is_active', true)
                ->first();

            if (!$schedule) {
                $this->line("[Lab {$lab->name}] Tidak ada jadwal aktif untuk hari ini.");
                return;
            }

            $wakeTime = $schedule->wake_time ? substr($schedule->wake_time, 0, 5) : null;
            $shutdownTime = $schedule->shutdown_time ? substr($schedule->shutdown_time, 0, 5) : null;
        }

        // 3. Eksekusi Wake on LAN jika waktu cocok
        if ($wakeTime && ($wakeTime === $currentTime || $force)) {
            $this->executeWake($lab);
        }

        // 4. Eksekusi Shutdown jika waktu cocok
        if ($shutdownTime && ($shutdownTime === $currentTime || $force)) {
            $this->executeShutdown($lab);
        }
    }

    protected function executeWake(Lab $lab): void
    {
        $macs = $lab->pcs()
            ->where('wol_enabled', true)
            ->pluck('mac_address')
            ->filter()
            ->values()
            ->toArray();

        if (empty($macs)) {
            $this->warn("[Lab {$lab->name}] Tidak ada PC dengan WoL aktif.");
            return;
        }

        $commandId = 'sched-wake-' . Str::random(10);

        // Catat Audit Log
        CommandLog::create([
            'command_id' => $commandId,
            'user_id' => null,
            'target_type' => 'lab',
            'target_id' => $lab->id,
            'action' => 'wake',
            'params' => ['mac_count' => count($macs), 'source' => 'scheduler'],
            'reason' => 'Otomasi Jadwal Nyala Lab Harian',
            'issued_at' => now(),
            'ttl_seconds' => 300,
            'source' => 'scheduler',
        ]);

        // Publish ke Relay Go
        $published = MqttPublisher::publish(
            "simlab/{$lab->slug}/relay/wake",
            [
                'command_id' => $commandId,
                'macs' => $macs,
                'broadcast_ip' => $lab->subnet_broadcast ?? '255.255.255.255',
            ]
        );

        if ($published) {
            $this->info("[Lab {$lab->name}] Berhasil memicu paket WoL ke " . count($macs) . " PC via relay.");
            Log::info("[Scheduler] Dispatched WoL for Lab {$lab->name} ({$lab->slug}) to " . count($macs) . " PCs.");
        } else {
            $this->error("[Lab {$lab->name}] Gagal menerbitkan pesan WoL ke MQTT.");
        }
    }

    protected function executeShutdown(Lab $lab): void
    {
        $pcs = $lab->pcs()
            ->where('status', 'online')
            ->get();

        if ($pcs->isEmpty()) {
            $this->line("[Lab {$lab->name}] Tidak ada PC online yang perlu dimatikan.");
            return;
        }

        $commandId = 'sched-shut-' . Str::random(10);

        // Catat Audit Log
        CommandLog::create([
            'command_id' => $commandId,
            'user_id' => null,
            'target_type' => 'lab',
            'target_id' => $lab->id,
            'action' => 'shutdown',
            'params' => ['pc_count' => $pcs->count(), 'source' => 'scheduler'],
            'reason' => 'Otomasi Jadwal Mati Lab Harian',
            'issued_at' => now(),
            'ttl_seconds' => 300,
            'source' => 'scheduler',
        ]);

        $publishedCount = 0;
        foreach ($pcs as $pc) {
            $success = MqttPublisher::publish(
                "simlab/{$lab->slug}/{$pc->slug}/command",
                [
                    'command_id' => $commandId,
                    'action' => 'shutdown',
                    'ttl_seconds' => 300,
                    'issued_at' => now()->toIso8601String(),
                ]
            );
            if ($success) {
                $publishedCount++;
            }
        }

        $this->info("[Lab {$lab->name}] Berhasil mengirim perintah shutdown ke {$publishedCount} PC online.");
        Log::info("[Scheduler] Dispatched Shutdown for Lab {$lab->name} to {$publishedCount} PCs.");
    }
}
