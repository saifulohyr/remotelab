<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Metric extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'pc_id', 'cpu_percent', 'ram_percent', 'disk_percent',
        'uptime_seconds', 'recorded_at',
    ];

    protected function casts(): array
    {
        return [
            'cpu_percent' => 'float',
            'ram_percent' => 'float',
            'disk_percent' => 'float',
            'uptime_seconds' => 'integer',
            'recorded_at' => 'datetime',
        ];
    }

    public function pc(): BelongsTo
    {
        return $this->belongsTo(Pc::class);
    }
}
