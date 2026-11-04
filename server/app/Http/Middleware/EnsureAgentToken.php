<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAgentToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = config('services.agent.token');

        if (! is_string($expected) || $expected === '') {
            // Compatibility window for agents installed before token support.
            // The live fleet cannot receive a new config remotely, so requests
            // stay allowed until AGENT_API_TOKEN is provisioned. Setting the
            // token automatically enables strict enforcement for every agent.
            return $next($request);
        }

        $provided = $request->header('X-Agent-Token', '');
        if (! is_string($provided) || ! hash_equals($expected, $provided)) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        return $next($request);
    }
}
