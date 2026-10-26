<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('command_logs', function (Blueprint $table) {
            $table->id();
            $table->uuid('command_id')->unique();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('target_type', ['pc', 'lab', 'all']);
            $table->unsignedBigInteger('target_id')->nullable();
            $table->string('action'); // shutdown, reboot, logoff, lock, message, wake
            $table->json('params')->nullable();
            $table->text('reason')->nullable();
            $table->timestamp('issued_at');
            $table->unsignedInteger('ttl_seconds')->default(120);
            $table->enum('source', ['manual', 'schedule', 'api'])->default('manual');
            $table->timestamps();

            $table->index(['issued_at']);
            $table->index(['user_id', 'issued_at']);
            $table->index(['target_type', 'target_id']);
        });

        Schema::create('command_results', function (Blueprint $table) {
            $table->id();
            $table->foreignId('command_log_id')->constrained()->onDelete('cascade');
            $table->foreignId('pc_id')->constrained()->onDelete('cascade');
            $table->enum('status', [
                'pending', 'delivered', 'executed', 'failed',
                'rejected_expired', 'rejected_duplicate', 'rejected_unknown', 'timeout',
            ])->default('pending');
            $table->text('error_message')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('executed_at')->nullable();

            $table->unique(['command_log_id', 'pc_id']);
            $table->index(['status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('command_results');
        Schema::dropIfExists('command_logs');
    }
};
