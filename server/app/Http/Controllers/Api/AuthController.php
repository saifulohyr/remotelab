<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;

class AuthController extends Controller
{
    /**
     * Login and obtain an API token.
     */
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        // Rate limiting: 5 attempts per minute per IP
        $throttleKey = 'login:' . $request->ip();
        if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
            $seconds = RateLimiter::availableIn($throttleKey);
            return response()->json([
                'message' => "Terlalu banyak percobaan login. Coba lagi dalam $seconds detik.",
            ], Response::HTTP_TOO_MANY_REQUESTS);
        }

        if (!Auth::attempt($request->only('email', 'password'))) {
            RateLimiter::hit($throttleKey, 60);
            return response()->json([
                'message' => 'Email atau password salah.',
            ], Response::HTTP_UNAUTHORIZED);
        }

        RateLimiter::clear($throttleKey);

        $user = Auth::user();
        $token = $user->createToken('simlab-dashboard')->plainTextToken;

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
            ],
            'token' => $token,
        ]);
    }

    /**
     * Logout and revoke the current token.
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'message' => 'Berhasil logout.',
        ]);
    }

    /**
     * Get the authenticated user's profile.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->load('labs:id,name,slug');

        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'labs' => $user->isSuperAdmin()
                ? \App\Models\Lab::select('id', 'name', 'slug')->get()
                : $user->labs,
        ]);
    }
}
