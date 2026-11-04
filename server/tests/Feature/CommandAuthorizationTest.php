<?php

namespace Tests\Feature;

use App\Models\CommandLog;
use App\Models\CommandResult;
use App\Models\Lab;
use App\Models\Notification;
use App\Models\Pc;
use App\Models\User;
use App\Services\MqttPublisher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Fakes\FakeMqttPublisher;
use Tests\TestCase;

class CommandAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private Lab $lab1;

    private Lab $lab2;

    private Pc $pc1;

    private Pc $pc2;

    private User $admin;

    private User $operator;

    private FakeMqttPublisher $mqtt;

    protected function setUp(): void
    {
        parent::setUp();
        $this->lab1 = Lab::create(['name' => 'Lab 1', 'slug' => 'lab1']);
        $this->lab2 = Lab::create(['name' => 'Lab 2', 'slug' => 'lab2']);
        $this->pc1 = Pc::create(['lab_id' => $this->lab1->id, 'hostname' => 'PC1', 'slug' => 'pc01', 'mac_address' => '00:00:00:00:00:01']);
        $this->pc2 = Pc::create(['lab_id' => $this->lab2->id, 'hostname' => 'PC2', 'slug' => 'pc01', 'mac_address' => '00:00:00:00:00:02']);
        $this->admin = User::create(['name' => 'Admin', 'email' => 'admin@test.local', 'password' => 'password', 'role' => 'superadmin']);
        $this->operator = User::create(['name' => 'Op', 'email' => 'op@test.local', 'password' => 'password', 'role' => 'operator']);
        $this->operator->labs()->attach($this->lab1->id);
        $this->mqtt = new FakeMqttPublisher;
        $this->app->instance(MqttPublisher::class, $this->mqtt);
    }

    public function test_every_selected_pc_is_an_audited_target(): void
    {
        $secondOwnPc = Pc::create(['lab_id' => $this->lab1->id, 'hostname' => 'PC1B', 'slug' => 'pc02', 'mac_address' => '00:00:00:00:00:03']);
        $this->actingAs($this->operator)->postJson('/api/commands', [
            'action' => 'message', 'target_type' => 'pc', 'pc_ids' => [$this->pc1->id, $secondOwnPc->id],
            'reason' => 'Pengumuman', 'params' => ['message' => 'Tes'],
        ])->assertCreated()->assertJsonPath('data.target_count', 2);

        $log = CommandLog::first();
        $this->assertSame(2, $log->results()->count());
        $this->assertCount(2, $this->mqtt->messages);
    }

    public function test_operator_cannot_target_cross_lab_pc_or_run_scripts(): void
    {
        $this->actingAs($this->operator)->postJson('/api/commands', [
            'action' => 'shutdown', 'target_type' => 'pc', 'target_id' => $this->pc2->id,
        ])->assertUnprocessable();
        $this->actingAs($this->operator)->postJson('/api/commands', [
            'action' => 'run_script', 'target_type' => 'pc', 'target_id' => $this->pc1->id,
            'params' => ['script' => 'whoami'],
        ])->assertForbidden();
        $this->assertSame(0, CommandLog::count());
    }

    public function test_publish_failure_is_not_reported_as_success(): void
    {
        $this->mqtt->results = [false];
        $this->actingAs($this->admin)->postJson('/api/commands', [
            'action' => 'shutdown', 'target_type' => 'pc', 'target_id' => $this->pc1->id,
        ])->assertStatus(502)->assertJsonPath('data.failed_count', 1);

        $this->assertSame('failed', CommandResult::first()->status);
    }

    public function test_command_detail_export_and_notification_are_scoped_to_operator_labs(): void
    {
        $own = $this->makeLog($this->pc1, 'own-command');
        $other = $this->makeLog($this->pc2, 'other-command');

        $this->actingAs($this->operator)->getJson("/api/commands/{$other->id}")->assertForbidden();
        $response = $this->actingAs($this->operator)->get('/api/commands/export');
        $response->assertOk();
        $csv = $response->streamedContent();
        $this->assertStringContainsString('own-command', $csv);
        $this->assertStringNotContainsString('other-command', $csv);

        $notification = Notification::create([
            'lab_id' => $this->lab2->id, 'pc_id' => $this->pc2->id,
            'type' => 'test', 'message' => 'test', 'is_read' => false, 'created_at' => now(),
        ]);
        $this->actingAs($this->operator)->postJson("/api/notifications/{$notification->id}/read")->assertForbidden();
        $this->assertFalse($notification->fresh()->is_read);
    }

    public function test_lab_and_all_targets_keep_authorization_semantics(): void
    {
        $this->actingAs($this->operator)->postJson('/api/commands', [
            'action' => 'message', 'target_type' => 'all', 'params' => ['message' => 'hello'],
        ])->assertCreated();
        $this->assertSame(1, CommandResult::count());
        $this->assertSame($this->pc1->id, CommandResult::first()->pc_id);
    }

    private function makeLog(Pc $pc, string $commandId): CommandLog
    {
        $log = CommandLog::create([
            'command_id' => $commandId, 'user_id' => $this->admin->id, 'target_type' => 'pc',
            'target_id' => $pc->id, 'action' => 'message', 'issued_at' => now(),
            'ttl_seconds' => 120, 'source' => 'manual',
        ]);
        CommandResult::create(['command_log_id' => $log->id, 'pc_id' => $pc->id, 'status' => 'pending']);

        return $log;
    }
}
