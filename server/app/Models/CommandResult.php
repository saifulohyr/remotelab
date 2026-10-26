<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CommandResult extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'command_log_id', 'pc_id', 'status',
        'error_message', 'delivered_at', 'executed_at',
    ];

    protected function casts(): array
    {
        return [
            'delivered_at' => 'datetime',
            'executed_at' => 'datetime',
        ];
    }

    public function commandLog(): BelongsTo
    {
        return $this->belongsTo(CommandLog::class);
    }

    public function pc(): BelongsTo
    {
        return $this->belongsTo(Pc::class);
    }
}
