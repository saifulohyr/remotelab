<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Lab extends Model
{
    protected $fillable = ['name', 'slug', 'location', 'description'];

    /**
     * PCs belonging to this lab.
     */
    public function pcs(): HasMany
    {
        return $this->hasMany(Pc::class);
    }

    /**
     * Schedules for this lab.
     */
    public function schedules(): HasMany
    {
        return $this->hasMany(Schedule::class);
    }

    /**
     * Schedule exceptions for this lab.
     */
    public function scheduleExceptions(): HasMany
    {
        return $this->hasMany(ScheduleException::class);
    }

    /**
     * Users assigned to this lab.
     */
    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_labs');
    }

    /**
     * Notifications for this lab.
     */
    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class);
    }

    /**
     * Get summary stats for this lab.
     */
    public function getSummaryAttribute(): array
    {
        $pcs = $this->pcs;
        $online = $pcs->where('status', 'online')->count();
        $offline = $pcs->whereIn('status', ['offline_normal', 'offline_abnormal'])->count();

        return [
            'total_pcs' => $pcs->count(),
            'online_count' => $online,
            'offline_count' => $offline,
            'booting_count' => $pcs->where('status', 'booting')->count(),
            'wake_failed_count' => $pcs->where('status', 'wake_failed')->count(),
        ];
    }
}
