<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PowerEvent extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'pc_id', 'event_type', 'source', 'user_id', 'created_at',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function pc(): BelongsTo
    {
        return $this->belongsTo(Pc::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
