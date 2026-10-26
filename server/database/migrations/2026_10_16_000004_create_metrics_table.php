<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('metrics', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pc_id')->constrained()->onDelete('cascade');
            $table->float('cpu_percent');
            $table->float('ram_percent');
            $table->float('disk_percent');
            $table->unsignedInteger('uptime_seconds');
            $table->timestamp('recorded_at');

            $table->index(['pc_id', 'recorded_at']);
            $table->index(['recorded_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('metrics');
    }
};
