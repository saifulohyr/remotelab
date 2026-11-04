<?php

namespace Tests\Unit;

use App\Services\MqttPublisher;
use Tests\TestCase;

class MqttPublisherTest extends TestCase
{
    public function test_tls_port_is_used_before_command_is_built(): void
    {
        config([
            'services.mqtt.use_tls' => true,
            'services.mqtt.port' => 1883,
            'services.mqtt.tls_port' => 8883,
            'services.mqtt.ca_cert_path' => '/test/ca.crt',
        ]);
        $publisher = new InspectingMqttPublisher;

        $this->assertTrue($publisher->publish('simlab/test', ['ok' => true]));
        $portIndex = array_search('-p', $publisher->command, true);
        $this->assertSame('8883', $publisher->command[$portIndex + 1]);
        $this->assertContains('--cafile', $publisher->command);
    }

    public function test_nonzero_process_result_is_a_publish_failure(): void
    {
        $publisher = new InspectingMqttPublisher;
        $publisher->exitCode = 1;
        $this->assertFalse($publisher->publish('simlab/test', []));
    }
}

class InspectingMqttPublisher extends MqttPublisher
{
    public array $command = [];

    public int $exitCode = 0;

    protected function runProcess(array $command): int
    {
        $this->command = $command;

        return $this->exitCode;
    }
}
