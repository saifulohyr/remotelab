<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pcs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lab_id')->constrained()->onDelete('cascade');
            $table->string('hostname');
            $table->string('slug');
            $table->string('mac_address', 17);
            $table->string('ip_address', 45)->nullable();
            $table->text('description')->nullable();
            $table->enum('status', [
                'online', 'booting', 'offline_normal', 'offline_abnormal',
                'wake_failed', 'unknown'
            ])->default('unknown');
            $table->timestamp('last_seen_at')->nullable();
            $table->string('agent_version')->nullable();
            $table->boolean('wol_enabled')->default(true);
            $table->timestamp('last_wake_at')->nullable();
            $table->timestamps();

            $table->unique(['lab_id', 'slug']);
            $table->unique(['lab_id', 'mac_address']);
            $table->index(['status']);
            $table->index(['last_seen_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pcs');
    }
};
