<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ScheduleException extends Model
{
    protected $fillable = [
        'lab_id', 'exception_date', 'type', 'wake_time',
        'shutdown_time', 'reason',
    ];

    protected function casts(): array
    {
        return [
            'exception_date' => 'date',
        ];
    }

    public function lab(): BelongsTo
    {
        return $this->belongsTo(Lab::class);
    }
}
