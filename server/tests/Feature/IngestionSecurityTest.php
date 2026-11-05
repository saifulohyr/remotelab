<?php

namespace Tests\Feature;

use App\Models\CommandLog;
use App\Models\CommandResult;
use App\Models\Lab;
use App\Models\Metric;
use App\Models\Pc;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Tests\TestCase;

class IngestionSecurityTest extends TestCase
{
    use RefreshDatabase;

    private Lab $lab;

    private Pc $pc;

    private Pc $otherPc;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.agent.token' => 'test-agent-token']);
        $this->lab = Lab::create(['name' => 'Lab 1', 'slug' => 'lab1']);
        $otherLab = Lab::create(['name' => 'Lab 2', 'slug' => 'lab2']);
        $this->pc = Pc::create(['lab_id' => $this->lab->id, 'hostname' => 'LAB1-PC01', 'slug' => 'pc01', 'mac_address' => '00:00:00:00:00:01', 'status' => 'unknown']);
        $this->otherPc = Pc::create(['lab_id' => $otherLab->id, 'hostname' => 'LAB2-PC01', 'slug' => 'pc01', 'mac_address' => '00:00:00:00:00:02', 'status' => 'unknown']);
    }

    public function test_ingestion_routes_require_agent_authentication(): void
    {
        $this->postJson('/api/telemetry', [])->assertUnauthorized();
        $this->postJson('/api/commands/ack', [])->assertUnauthorized();
    }

    public function test_http_telemetry_is_idempotent_and_preserves_sample_fields(): void
    {
        $payload = [
            'lab_id' => 'lab1', 'pc_id' => 'pc01', 'sample_id' => 'sample-001',
            'timestamp' => 1_793_600_000, 'uptime_seconds' => 321,
            'metrics' => ['cpu_percent' => 12.5, 'ram_percent' => 40, 'disk_percent' => 55],
        ];
        $headers = ['X-Agent-Token' => 'test-agent-token'];

        $this->postJson('/api/telemetry', $payload, $headers)->assertOk();
        $this->postJson('/api/telemetry', $payload, $headers)->assertOk();

        $this->assertSame(1, Metric::count());
        $metric = Metric::first();
        $this->assertSame('sample-001', $metric->sample_id);
        $this->assertSame(321, $metric->uptime_seconds);
        $this->assertSame(1_793_600_000, $metric->recorded_at->timestamp);
    }

    public function test_stale_telemetry_cannot_overwrite_newer_pc_status(): void
    {
        $this->pc->update(['status' => 'offline_normal', 'last_seen_at' => Carbon::createFromTimestampUTC(1_793_600_100)]);
        $this->postJson('/api/telemetry', [
            'lab_id' => 'lab1', 'pc_id' => 'pc01', 'sample_id' => 'old-sample',
            'timestamp' => 1_793_600_000, 'status' => 'online',
        ], ['X-Agent-Token' => 'test-agent-token'])->assertOk();
        $this->assertSame('offline_normal', $this->pc->fresh()->status);
    }

    public function test_unknown_identity_is_rejected_and_never_auto_created(): void
    {
        $before = Pc::count();
        $this->postJson('/api/telemetry', [
            'lab_id' => 'lab1', 'pc_id' => 'unknown-pc', 'metrics' => ['cpu_percent' => 1],
        ], ['X-Agent-Token' => 'test-agent-token'])->assertNotFound();
        $this->assertSame($before, Pc::count());
    }

    public function test_legacy_agent_payload_without_token_or_sample_id_is_still_accepted(): void
    {
        // The live fleet was installed before token support and may not send a
        // timestamp or sample_id either. Until AGENT_API_TOKEN is provisioned,
        // those agents must keep reporting.
        config(['services.agent.token' => null]);

        $this->postJson('/api/telemetry', [
            'lab_id' => 'lab1',
            'pc_id' => 'LAB1-PC01',
            'hostname' => 'LAB1-PC01',
            'status' => 'online',
            'version' => '1.0.0',
            'ip_address' => '192.168.1.10',
            'metrics' => ['cpu_percent' => 11, 'ram_percent' => 22, 'disk_percent' => 33],
        ])->assertOk()->assertJsonPath('pc_id', $this->pc->id);

        $this->assertSame('online', $this->pc->fresh()->status);
        $this->assertSame(1, Metric::where('pc_id', $this->pc->id)->count());
    }

    public function test_empty_pending_command_params_are_returned_as_json_object(): void
    {
        $log = CommandLog::create([
            'command_id' => (string) Str::uuid7(), 'user_id' => null, 'target_type' => 'pc',
            'target_id' => $this->pc->id, 'action' => 'shutdown', 'params' => [],
            'issued_at' => now(), 'ttl_seconds' => 120, 'source' => 'manual',
        ]);
        CommandResult::create(['command_log_id' => $log->id, 'pc_id' => $this->pc->id, 'status' => 'pending']);

        $response = $this->postJson('/api/telemetry', [
            'lab_id' => 'lab1', 'pc_id' => 'LAB1-PC01',
        ], ['X-Agent-Token' => 'test-agent-token'])->assertOk();

        $payload = json_decode($response->getContent(), false, 512, JSON_THROW_ON_ERROR);
        $this->assertCount(1, $payload->commands);
        $this->assertSame('shutdown', $payload->commands[0]->action);
        $this->assertInstanceOf(\stdClass::class, $payload->commands[0]->params);
        $this->assertSame('{}', json_encode($payload->commands[0]->params, JSON_THROW_ON_ERROR));
    }

    public function test_legacy_hostname_ack_is_scoped_to_the_exact_command_target(): void
    {
        $log = CommandLog::create([
            'command_id' => (string) Str::uuid7(), 'user_id' => null, 'target_type' => 'pc',
            'target_id' => $this->pc->id, 'action' => 'message', 'issued_at' => now(),
            'ttl_seconds' => 120, 'source' => 'manual',
        ]);
        $result = CommandResult::create(['command_log_id' => $log->id, 'pc_id' => $this->pc->id, 'status' => 'delivered']);

        $this->postJson('/api/commands/ack', [
            'command_id' => $log->command_id,
            'pc_id' => 'LAB1-PC01',
            'hostname' => 'LAB1-PC01',
            'status' => 'executed',
            'output' => 'legacy output',
        ], ['X-Agent-Token' => 'test-agent-token'])->assertOk()->assertJson(['updated' => true]);

        $this->assertSame('executed', $result->fresh()->status);
        $this->assertSame('legacy output', $result->fresh()->output);
    }

    public function test_ack_requires_exact_pc_and_persists_output_without_status_regression(): void
    {
        $log = CommandLog::create([
            'command_id' => (string) Str::uuid7(), 'user_id' => null, 'target_type' => 'pc',
            'target_id' => $this->pc->id, 'action' => 'run_script', 'issued_at' => now(),
            'ttl_seconds' => 120, 'source' => 'manual',
        ]);
        $result = CommandResult::create(['command_log_id' => $log->id, 'pc_id' => $this->pc->id, 'status' => 'delivered']);
        $headers = ['X-Agent-Token' => 'test-agent-token'];

        $this->postJson('/api/commands/ack', [
            'command_id' => $log->command_id, 'pc_id' => $this->otherPc->id,
            'status' => 'executed', 'output' => 'wrong pc',
        ], $headers)->assertNotFound();

        $this->postJson('/api/commands/ack', [
            'command_id' => $log->command_id, 'pc_id' => $this->pc->id,
            'status' => 'executed', 'output' => "stdout\nstderr", 'exit_code' => 0,
        ], $headers)->assertOk()->assertJson(['updated' => true]);
        $this->assertSame("stdout\nstderr", $result->fresh()->output);

        $this->postJson('/api/commands/ack', [
            'command_id' => $log->command_id, 'pc_id' => $this->pc->id,
            'status' => 'rejected_duplicate', 'output' => 'duplicate',
        ], $headers)->assertOk()->assertJson(['updated' => false]);
        $this->assertSame('executed', $result->fresh()->status);
        $this->assertSame("stdout\nstderr", $result->fresh()->output);
    }

    public function test_all_supported_ack_statuses_are_persisted_per_result(): void
    {
        $statuses = ['delivered', 'executed', 'failed', 'rejected_expired', 'rejected_duplicate', 'rejected_unknown', 'timeout'];
        foreach ($statuses as $status) {
            $log = CommandLog::create([
                'command_id' => (string) Str::uuid7(), 'user_id' => null, 'target_type' => 'pc',
                'target_id' => $this->pc->id, 'action' => 'message', 'issued_at' => now(),
                'ttl_seconds' => 120, 'source' => 'manual',
            ]);
            $result = CommandResult::create(['command_log_id' => $log->id, 'pc_id' => $this->pc->id, 'status' => 'pending']);
            $this->postJson('/api/commands/ack', [
                'command_id' => $log->command_id, 'pc_id' => $this->pc->id,
                'status' => $status, 'output' => 'script output',
            ], ['X-Agent-Token' => 'test-agent-token'])->assertOk()->assertJson(['updated' => true]);
            $this->assertSame($status, $result->fresh()->status);
        }
    }

    public function test_operator_cannot_read_or_mutate_another_labs_pc(): void
    {
        $operator = User::create(['name' => 'Op', 'email' => 'op@test.local', 'password' => 'password', 'role' => 'operator']);
        $operator->labs()->attach($this->lab->id);
        $this->actingAs($operator);

        $this->getJson("/api/pcs/{$this->otherPc->id}")->assertForbidden();
        $this->getJson("/api/pcs/{$this->otherPc->id}/metrics")->assertForbidden();
        $this->getJson("/api/pcs/{$this->otherPc->id}/events")->assertForbidden();
    }
}
