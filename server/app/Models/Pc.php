<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Pc extends Model
{
    protected $fillable = [
        'lab_id', 'hostname', 'slug', 'mac_address', 'ip_address',
        'description', 'status', 'last_seen_at', 'agent_version',
        'wol_enabled', 'last_wake_at',
    ];

    protected function casts(): array
    {
        return [
            'last_seen_at' => 'datetime',
            'last_wake_at' => 'datetime',
            'wol_enabled' => 'boolean',
        ];
    }

    /**
     * Lab this PC belongs to.
     */
    public function lab(): BelongsTo
    {
        return $this->belongsTo(Lab::class);
    }

    /**
     * Telemetry metrics for this PC.
     */
    public function metrics(): HasMany
    {
        return $this->hasMany(Metric::class);
    }

    /**
     * Aggregated minute-level metrics for this PC.
     */
    public function metricsMenit(): HasMany
    {
        return $this->hasMany(MetricMinute::class);
    }

    /**
     * Power events for this PC.
     */
    public function powerEvents(): HasMany
    {
        return $this->hasMany(PowerEvent::class);
    }

    /**
     * Command results targeting this PC.
     */
    public function commandResults(): HasMany
    {
        return $this->hasMany(CommandResult::class);
    }

    /**
     * Whether this PC is currently online.
     */
    public function getIsOnlineAttribute(): bool
    {
        return $this->status === 'online';
    }

    /**
     * Status color for frontend display.
     */
    public function getStatusColorAttribute(): string
    {
        return match ($this->status) {
            'online' => 'green',
            'booting' => 'yellow',
            'offline_normal' => 'gray',
            'offline_abnormal' => 'red',
            'wake_failed' => 'orange',
            default => 'white',
        };
    }
}
