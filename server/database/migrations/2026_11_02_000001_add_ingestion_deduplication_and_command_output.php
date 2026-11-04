<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('metrics', function (Blueprint $table) {
            $table->string('sample_id', 64)->nullable()->after('id');
            $table->unique(['pc_id', 'sample_id']);
        });

        Schema::table('command_results', function (Blueprint $table) {
            $table->text('output')->nullable()->after('error_message');
        });
    }

    public function down(): void
    {
        Schema::table('metrics', function (Blueprint $table) {
            $table->dropUnique(['pc_id', 'sample_id']);
            $table->dropColumn('sample_id');
        });

        Schema::table('command_results', function (Blueprint $table) {
            $table->dropColumn('output');
        });
    }
};
