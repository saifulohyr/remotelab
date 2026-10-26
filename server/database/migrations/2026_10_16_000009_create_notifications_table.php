<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lab_id')->constrained()->onDelete('cascade');
            $table->foreignId('pc_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type'); // offline_abnormal, wake_failed, command_failed, etc.
            $table->text('message');
            $table->json('data')->nullable();
            $table->boolean('is_read')->default(false);
            $table->timestamp('created_at');

            $table->index(['lab_id', 'is_read', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
