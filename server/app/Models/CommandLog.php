<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CommandLog extends Model
{
    protected $fillable = [
        'command_id', 'user_id', 'target_type', 'target_id',
        'action', 'params', 'reason', 'issued_at', 'ttl_seconds', 'source',
    ];

    protected function casts(): array
    {
        return [
            'params' => 'array',
            'issued_at' => 'datetime',
            'ttl_seconds' => 'integer',
        ];
    }

    /**
     * User who issued the command.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Per-PC results/acks for this command.
     */
    public function results(): HasMany
    {
        return $this->hasMany(CommandResult::class);
    }

    /**
     * Summary of result statuses for this command.
     */
    public function getResultsSummaryAttribute(): array
    {
        return $this->results
            ->groupBy('status')
            ->map->count()
            ->toArray();
    }
}
