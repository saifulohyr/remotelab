<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MetricMinute extends Model
{
    protected $table = 'metrics_menit';

    public $timestamps = false;

    protected $fillable = [
        'pc_id', 'avg_cpu', 'max_cpu', 'avg_ram', 'max_ram',
        'avg_disk', 'max_disk', 'minute_at',
    ];

    protected function casts(): array
    {
        return [
            'avg_cpu' => 'float',
            'max_cpu' => 'float',
            'avg_ram' => 'float',
            'max_ram' => 'float',
            'avg_disk' => 'float',
            'max_disk' => 'float',
            'minute_at' => 'datetime',
        ];
    }

    public function pc(): BelongsTo
    {
        return $this->belongsTo(Pc::class);
    }
}
