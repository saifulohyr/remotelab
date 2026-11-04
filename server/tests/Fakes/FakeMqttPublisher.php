<?php

namespace Tests\Fakes;

use App\Services\MqttPublisher;

class FakeMqttPublisher extends MqttPublisher
{
    public array $messages = [];

    public array $results = [];

    public function publish(string $topic, array|string $payload, int $qos = 1, bool $retain = false): bool
    {
        $this->messages[] = compact('topic', 'payload', 'qos', 'retain');

        return array_shift($this->results) ?? true;
    }
}
