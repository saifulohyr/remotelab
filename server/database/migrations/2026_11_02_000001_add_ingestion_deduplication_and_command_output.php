<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Idempotent because the live server already had command_results.output
        // added manually before this migration was introduced. A partially
        // applied migration must be safe to run again.
        if (! Schema::hasColumn('metrics', 'sample_id')) {
            Schema::table('metrics', function (Blueprint $table) {
                $table->string('sample_id', 64)->nullable()->after('id');
            });
        }

        if (! Schema::hasIndex('metrics', 'metrics_pc_id_sample_id_unique')) {
            Schema::table('metrics', function (Blueprint $table) {
                $table->unique(['pc_id', 'sample_id']);
            });
        }

        if (! Schema::hasColumn('command_results', 'output')) {
            Schema::table('command_results', function (Blueprint $table) {
                $table->text('output')->nullable()->after('error_message');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasIndex('metrics', 'metrics_pc_id_sample_id_unique')) {
            Schema::table('metrics', function (Blueprint $table) {
                $table->dropUnique(['pc_id', 'sample_id']);
            });
        }

        if (Schema::hasColumn('metrics', 'sample_id')) {
            Schema::table('metrics', function (Blueprint $table) {
                $table->dropColumn('sample_id');
            });
        }

        if (Schema::hasColumn('command_results', 'output')) {
            Schema::table('command_results', function (Blueprint $table) {
                $table->dropColumn('output');
            });
        }
    }
};
