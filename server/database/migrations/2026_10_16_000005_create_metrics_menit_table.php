<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('metrics_menit', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pc_id')->constrained()->onDelete('cascade');
            $table->float('avg_cpu');
            $table->float('max_cpu');
            $table->float('avg_ram');
            $table->float('max_ram');
            $table->float('avg_disk');
            $table->float('max_disk');
            $table->timestamp('minute_at');

            $table->unique(['pc_id', 'minute_at']);
            $table->index(['pc_id', 'minute_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('metrics_menit');
    }
};
