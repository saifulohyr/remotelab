<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('power_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pc_id')->constrained()->onDelete('cascade');
            $table->enum('event_type', [
                'boot', 'shutdown_normal', 'shutdown_abnormal',
                'wake_sent', 'wake_success', 'wake_failed',
            ]);
            $table->enum('source', ['agent', 'server_detection', 'relay', 'schedule', 'manual']);
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('created_at');

            $table->index(['pc_id', 'created_at']);
            $table->index(['event_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('power_events');
    }
};
