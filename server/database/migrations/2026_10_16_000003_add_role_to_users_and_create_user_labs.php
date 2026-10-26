<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add role and modify users table for SIMLab
        Schema::table('users', function (Blueprint $table) {
            $table->enum('role', ['superadmin', 'operator'])->default('operator')->after('password');
        });

        // Pivot: user ↔ lab assignment (operator access control)
        Schema::create('user_labs', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->foreignId('lab_id')->constrained()->onDelete('cascade');
            $table->primary(['user_id', 'lab_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_labs');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('role');
        });
    }
};
