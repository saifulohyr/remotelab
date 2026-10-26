<?php

namespace Database\Seeders;

use App\Models\Lab;
use App\Models\Pc;
use App\Models\Schedule;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Create superadmin
        $admin = User::create([
            'name' => 'Admin SIMLab',
            'email' => 'admin@simlab.local',
            'password' => bcrypt('password'),
            'role' => 'superadmin',
        ]);

        // Create operators
        $operator1 = User::create([
            'name' => 'Operator Lab 1-3',
            'email' => 'op1@simlab.local',
            'password' => bcrypt('password'),
            'role' => 'operator',
        ]);

        $operator2 = User::create([
            'name' => 'Operator Lab 4-6',
            'email' => 'op2@simlab.local',
            'password' => bcrypt('password'),
            'role' => 'operator',
        ]);

        // Create 6 labs
        $labs = [];
        for ($i = 1; $i <= 6; $i++) {
            $labs[$i] = Lab::create([
                'name' => "Lab Komputer $i",
                'slug' => "lab$i",
                'location' => "Gedung A Lantai " . ceil($i / 2) . ", Ruang " . (100 + $i),
                'description' => "Lab komputer $i dengan 30 unit PC",
            ]);
        }

        // Assign operators to labs
        $operator1->labs()->attach([$labs[1]->id, $labs[2]->id, $labs[3]->id]);
        $operator2->labs()->attach([$labs[4]->id, $labs[5]->id, $labs[6]->id]);

        // Create PCs for each lab (30 PCs per lab)
        foreach ($labs as $labNum => $lab) {
            for ($pc = 1; $pc <= 30; $pc++) {
                $pcNum = str_pad($pc, 2, '0', STR_PAD_LEFT);
                Pc::create([
                    'lab_id' => $lab->id,
                    'hostname' => "LAB{$labNum}-PC{$pcNum}",
                    'slug' => "pc{$pcNum}",
                    'mac_address' => sprintf(
                        '00:1A:2B:%02X:%02X:%02X',
                        $labNum, $pc, rand(0, 255)
                    ),
                    'ip_address' => "192.168.{$labNum}.{$pc}",
                    'description' => "PC $pc di Lab $labNum",
                    'status' => 'unknown',
                    'wol_enabled' => true,
                ]);
            }
        }

        // Create default schedules (Mon-Fri, 07:30 - 17:00)
        foreach ($labs as $lab) {
            for ($day = 1; $day <= 5; $day++) { // Senin-Jumat
                Schedule::create([
                    'lab_id' => $lab->id,
                    'day_of_week' => $day,
                    'wake_time' => '07:30',
                    'shutdown_time' => '17:00',
                    'is_active' => true,
                ]);
            }

            // Sabtu (half day)
            Schedule::create([
                'lab_id' => $lab->id,
                'day_of_week' => 6,
                'wake_time' => '07:30',
                'shutdown_time' => '12:00',
                'is_active' => true,
            ]);
        }

        $this->command->info("Seeded: 1 admin, 2 operators, 6 labs, 180 PCs, 36 schedules");
    }
}
