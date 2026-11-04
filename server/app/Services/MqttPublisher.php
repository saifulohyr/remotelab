<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Symfony\Component\Process\Process;

class MqttPublisher
{
    /**
     * Publish a message without exposing credentials through a shell command.
     */
    public function publish(string $topic, array|string $payload, int $qos = 1, bool $retain = false): bool
    {
        if (is_array($payload)) {
            $payload = json_encode($payload, JSON_THROW_ON_ERROR);
        }

        $useTls = (bool) config('services.mqtt.use_tls', false);
        $port = $useTls
            ? config('services.mqtt.tls_port', 8883)
            : config('services.mqtt.port', 1883);

        $command = [
            config('services.mqtt.binary', 'mosquitto_pub'),
            '-h', config('services.mqtt.host', '127.0.0.1'),
            '-p', (string) $port,
            '-t', $topic,
            '-m', $payload,
            '-q', (string) $qos,
        ];

        if ($retain) {
            $command[] = '-r';
        }

        $username = config('services.mqtt.username', '');
        if ($username) {
            $command[] = '-u';
            $command[] = $username;
            $command[] = '-P';
            $command[] = config('services.mqtt.password', '');
        }

        if ($useTls) {
            $caFile = config('services.mqtt.ca_cert_path', '');
            if (! $caFile) {
                Log::error('[MqttPublisher] TLS requires a CA certificate.');

                return false;
            }
            $command[] = '--cafile';
            $command[] = $caFile;
        }

        try {
            $exitCode = $this->runProcess($command);
        } catch (\Throwable $e) {
            Log::error("[MqttPublisher] Failed to publish to {$topic}: {$e->getMessage()}");

            return false;
        }

        if ($exitCode !== 0) {
            Log::error("[MqttPublisher] Broker rejected publish to {$topic} (exit {$exitCode}).");

            return false;
        }

        Log::debug("[MqttPublisher] Published to {$topic}");

        return true;
    }

    protected function runProcess(array $command): int
    {
        $process = new Process($command);
        $process->setTimeout(10)->run();

        return $process->getExitCode() ?? 1;
    }
}
