<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Service for publishing MQTT messages from Laravel via the Mosquitto REST API
 * or a lightweight PHP MQTT client.
 *
 * For simplicity, this implementation uses mosquitto_pub via shell command.
 * In production, consider using php-mqtt/client or a dedicated MQTT bridge.
 */
class MqttPublisher
{
    /**
     * Publish a message to an MQTT topic.
     */
    public static function publish(string $topic, array|string $payload, int $qos = 1, bool $retain = false): bool
    {
        if (is_array($payload)) {
            $payload = json_encode($payload);
        }

        $host = config('services.mqtt.host', '127.0.0.1');
        $port = config('services.mqtt.port', 1883);
        $username = config('services.mqtt.username', '');
        $password = config('services.mqtt.password', '');

        // Build mosquitto_pub command
        $cmd = sprintf(
            'mosquitto_pub -h %s -p %d -t %s -m %s -q %d',
            escapeshellarg($host),
            $port,
            escapeshellarg($topic),
            escapeshellarg($payload),
            $qos
        );

        if ($retain) {
            $cmd .= ' -r';
        }

        if ($username) {
            $cmd .= sprintf(' -u %s -P %s', escapeshellarg($username), escapeshellarg($password));
        }

        // Check if TLS is enabled
        if (config('services.mqtt.use_tls', false)) {
            $cmd .= sprintf(' --cafile %s', escapeshellarg(config('services.mqtt.ca_cert_path', '')));
            $port = config('services.mqtt.tls_port', 8883);
        }

        $cmd .= ' 2>&1';

        $output = [];
        $exitCode = 0;
        exec($cmd, $output, $exitCode);

        if ($exitCode !== 0) {
            Log::error("[MqttPublisher] Failed to publish to {$topic}: " . implode("\n", $output));
            return false;
        }

        Log::debug("[MqttPublisher] Published to {$topic}");
        return true;
    }
}
