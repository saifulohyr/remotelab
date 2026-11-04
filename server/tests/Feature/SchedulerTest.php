<?php

namespace Tests\Feature;

use App\Models\CommandLog;
use App\Models\CommandResult;
use App\Models\Lab;
use App\Models\Pc;
use App\Models\PowerEvent;
use App\Models\Schedule;
use App\Models\ScheduleException;
use App\Models\User;
use App\Services\MqttPublisher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Fakes\FakeMqttPublisher;
use Tests\TestCase;

class SchedulerTest extends TestCase
{
    use RefreshDatabase;

    private Lab $lab;

    private Pc $pc;

    private FakeMqttPublisher $mqtt;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.timezone' => 'UTC', 'services.simlab.timezone' => 'Asia/Jakarta']);
        $this->lab = Lab::create(['name' => 'Lab 1', 'slug' => 'lab1']);
        $this->pc = Pc::create(['lab_id' => $this->lab->id, 'hostname' => 'PC1', 'slug' => 'pc01', 'mac_address' => '00:00:00:00:00:01', 'status' => 'online', 'wol_enabled' => true]);
        $this->mqtt = new FakeMqttPublisher;
        $this->app->instance(MqttPublisher::class, $this->mqtt);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_scheduler_payload_has_unix_timestamp_and_is_idempotent(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-02 17:00:00', 'Asia/Jakarta'));
        Schedule::create(['lab_id' => $this->lab->id, 'day_of_week' => 1, 'wake_time' => '07:30', 'shutdown_time' => '17:00', 'is_active' => true]);

        $this->artisan('simlab:check-schedules')->assertSuccessful();
        $this->artisan('simlab:check-schedules')->assertSuccessful();

        $this->assertSame(1, CommandLog::count());
        $log = CommandLog::first();
        $this->assertSame('schedule', $log->source);
        $this->assertSame(1, CommandResult::count());
        $this->assertCount(1, $this->mqtt->messages);
        $this->assertIsInt($this->mqtt->messages[0]['payload']['issued_at']);
        $this->assertSame($log->issued_at->timestamp, $this->mqtt->messages[0]['payload']['issued_at']);
    }

    public function test_force_wake_creates_per_pc_audit_and_cannot_repeat_same_day(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-02 12:00:00', 'Asia/Jakarta'));
        Schedule::create(['lab_id' => $this->lab->id, 'day_of_week' => 1, 'wake_time' => '07:30', 'shutdown_time' => null, 'is_active' => true]);

        $this->artisan('simlab:check-schedules', ['--force' => true])->assertSuccessful();
        $this->artisan('simlab:check-schedules', ['--force' => true])->assertSuccessful();

        $this->assertSame(1, CommandLog::where('action', 'wake')->count());
        $this->assertSame(1, CommandResult::count());
        $this->assertSame(1, PowerEvent::where('event_type', 'wake_sent')->count());
        $this->assertSame('simlab/lab1/relay/wake', $this->mqtt->messages[0]['topic']);
    }

    public function test_skip_and_override_exceptions_are_enforced(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-02 07:30:00', 'Asia/Jakarta'));
        Schedule::create(['lab_id' => $this->lab->id, 'day_of_week' => 1, 'wake_time' => '07:30', 'shutdown_time' => null, 'is_active' => true]);
        ScheduleException::create(['lab_id' => $this->lab->id, 'exception_date' => '2026-11-02', 'type' => 'skip', 'reason' => 'Libur']);
        $this->artisan('simlab:check-schedules')->assertSuccessful();
        $this->assertSame(0, CommandLog::count());

        ScheduleException::first()->update(['type' => 'override', 'wake_time' => '07:30', 'shutdown_time' => null]);
        $this->artisan('simlab:check-schedules')->assertSuccessful();
        $this->assertSame(1, CommandLog::where('action', 'wake')->count());
    }

    public function test_failed_scheduler_publish_marks_results_failed(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-02 07:30:00', 'Asia/Jakarta'));
        Schedule::create(['lab_id' => $this->lab->id, 'day_of_week' => 1, 'wake_time' => '07:30', 'shutdown_time' => null, 'is_active' => true]);
        $this->mqtt->results = [false];

        $this->artisan('simlab:check-schedules')->assertSuccessful();
        $this->assertSame('failed', CommandResult::first()->status);
        $this->assertSame(1, PowerEvent::where('event_type', 'wake_failed')->count());
    }

    public function test_schedule_exception_api_validates_skip_and_override(): void
    {
        $admin = User::create(['name' => 'Admin', 'email' => 'admin@test.local', 'password' => 'password', 'role' => 'superadmin']);
        $this->actingAs($admin)->postJson("/api/labs/{$this->lab->id}/schedule-exceptions", [
            'exception_date' => '2026-11-10', 'type' => 'skip', 'reason' => 'Libur',
        ])->assertOk()->assertJsonPath('data.type', 'skip');

        $this->actingAs($admin)->postJson("/api/labs/{$this->lab->id}/schedule-exceptions", [
            'exception_date' => '2026-11-11', 'type' => 'override',
        ])->assertUnprocessable();
    }
}
