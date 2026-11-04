<?php

namespace Tests\Feature;

use App\Models\Lab;
use App\Models\Metric;
use App\Models\Notification;
use App\Models\Pc;
use App\Models\PowerEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PcDecommissionTest extends TestCase
{
    use RefreshDatabase;

    private Lab $lab;

    private Lab $otherLab;

    private Pc $pc;

    private User $superadmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->lab = Lab::create(['name' => 'Lab 1', 'slug' => 'lab1']);
        $this->otherLab = Lab::create(['name' => 'Lab 2', 'slug' => 'lab2']);

        $this->pc = Pc::create([
            'lab_id' => $this->lab->id,
            'hostname' => 'LAB1-PC01',
            'slug' => 'pc01',
            'mac_address' => '00:00:00:00:00:01',
            'status' => 'online',
            'last_seen_at' => now(),
        ]);

        $this->superadmin = User::create([
            'name' => 'Super Admin',
            'email' => 'admin@test.local',
            'password' => 'password',
            'role' => 'superadmin',
        ]);

        Metric::create([
            'pc_id' => $this->pc->id,
            'cpu_percent' => 10,
            'ram_percent' => 20,
            'disk_percent' => 30,
            'uptime_seconds' => 100,
            'recorded_at' => now(),
        ]);

        PowerEvent::create([
            'pc_id' => $this->pc->id,
            'event_type' => 'boot',
            'source' => 'agent',
            'created_at' => now(),
        ]);

        Notification::create([
            'lab_id' => $this->lab->id,
            'pc_id' => $this->pc->id,
            'type' => 'offline_abnormal',
            'message' => 'PC offline',
            'created_at' => now(),
        ]);
    }

    public function test_superadmin_can_permanently_remove_a_decommissioned_pc(): void
    {
        Sanctum::actingAs($this->superadmin);

        $this->deleteJson("/api/pcs/{$this->pc->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $this->pc->id)
            ->assertJsonPath('data.hostname', 'LAB1-PC01');

        $this->assertDatabaseMissing('pcs', ['id' => $this->pc->id]);
        $this->assertDatabaseMissing('metrics', ['pc_id' => $this->pc->id]);
        $this->assertDatabaseMissing('power_events', ['pc_id' => $this->pc->id]);
        $this->assertDatabaseHas('notifications', ['pc_id' => null]);
    }

    public function test_operator_can_remove_a_pc_in_an_assigned_lab(): void
    {
        $operator = User::create([
            'name' => 'Operator',
            'email' => 'operator@test.local',
            'password' => 'password',
            'role' => 'operator',
        ]);
        $operator->labs()->attach($this->lab->id);

        Sanctum::actingAs($operator);

        $this->deleteJson("/api/pcs/{$this->pc->id}")->assertOk();
        $this->assertDatabaseMissing('pcs', ['id' => $this->pc->id]);
    }

    public function test_operator_cannot_remove_a_pc_from_another_lab(): void
    {
        $operator = User::create([
            'name' => 'Operator',
            'email' => 'operator@test.local',
            'password' => 'password',
            'role' => 'operator',
        ]);
        $operator->labs()->attach($this->otherLab->id);

        Sanctum::actingAs($operator);

        $this->deleteJson("/api/pcs/{$this->pc->id}")->assertForbidden();
        $this->assertDatabaseHas('pcs', ['id' => $this->pc->id]);
    }

    public function test_guest_cannot_remove_a_pc(): void
    {
        $this->deleteJson("/api/pcs/{$this->pc->id}")->assertUnauthorized();
        $this->assertDatabaseHas('pcs', ['id' => $this->pc->id]);
    }
}
