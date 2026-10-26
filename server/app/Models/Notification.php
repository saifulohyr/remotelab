<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Notification extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'lab_id', 'pc_id', 'type', 'message', 'data', 'is_read', 'created_at',
    ];

    protected function casts(): array
    {
        return [
            'data' => 'array',
            'is_read' => 'boolean',
            'created_at' => 'datetime',
        ];
    }

    public function lab(): BelongsTo
    {
        return $this->belongsTo(Lab::class);
    }

    public function pc(): BelongsTo
    {
        return $this->belongsTo(Pc::class);
    }
}
