<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lab_id')->constrained()->onDelete('cascade');
            $table->unsignedTinyInteger('day_of_week'); // 0=Sunday, 6=Saturday
            $table->time('wake_time')->nullable();
            $table->time('shutdown_time')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['lab_id', 'day_of_week']);
        });

        Schema::create('schedule_exceptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lab_id')->constrained()->onDelete('cascade');
            $table->date('exception_date');
            $table->enum('type', ['skip', 'override']);
            $table->time('wake_time')->nullable();
            $table->time('shutdown_time')->nullable();
            $table->text('reason')->nullable();
            $table->timestamps();

            $table->unique(['lab_id', 'exception_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('schedule_exceptions');
        Schema::dropIfExists('schedules');
    }
};
