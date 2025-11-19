using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using DCAAuth.SDK.Managers;
using DCAAuth.SDK.Models;
using DCAAuth.SDK.Storage;
using DCAAuth.SDK.Utils;
using Polly;
using Polly.Extensions.Http;

namespace DCAAuth.SDK
{
    /// <summary>
    /// Main client for interacting with the DCA-Auth API.
    /// </summary>
    public class DCAAuthClient : IDisposable
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<DCAAuthClient> _logger;
        private readonly DCAAuthClientOptions _options;
        private readonly IStorage _storage;
        private readonly IAsyncPolicy<HttpResponseMessage> _retryPolicy;
        private readonly EventEmitter _eventEmitter;
        private readonly SemaphoreSlim _refreshLock;
        private bool _disposed;

        /// <summary>
        /// License management operations.
        /// </summary>
        public ILicenseManager Licenses { get; }

        /// <summary>
        /// Authentication operations.
        /// </summary>
        public IAuthManager Auth { get; }

        /// <summary>
        /// User management operations.
        /// </summary>
        public IUserManager Users { get; }

        /// <summary>
        /// Webhook management operations.
        /// </summary>
        public IWebhookManager Webhooks { get; }

        /// <summary>
        /// Real-time WebSocket client.
        /// </summary>
        public IRealtimeClient Realtime { get; }

        /// <summary>
        /// Event emitter for subscribing to SDK events.
        /// </summary>
        public IEventEmitter Events => _eventEmitter;

        /// <summary>
        /// Initializes a new instance of the DCAAuthClient.
        /// </summary>
        /// <param name="options">Client configuration options.</param>
        /// <param name="httpClient">Optional HTTP client instance.</param>
        /// <param name="logger">Optional logger instance.</param>
        public DCAAuthClient(
            DCAAuthClientOptions options,
            HttpClient httpClient = null,
            ILogger<DCAAuthClient> logger = null)
        {
            _options = options ?? throw new ArgumentNullException(nameof(options));
            _logger = logger ?? new NullLogger<DCAAuthClient>();
            _storage = options.Storage ?? new MemoryStorage();
            _eventEmitter = new EventEmitter();
            _refreshLock = new SemaphoreSlim(1, 1);

            // Configure HTTP client
            _httpClient = ConfigureHttpClient(httpClient ?? new HttpClient());

            // Setup retry policy
            _retryPolicy = CreateRetryPolicy();

            // Initialize managers
            Licenses = new LicenseManager(this);
            Auth = new AuthManager(this);
            Users = new UserManager(this);
            Webhooks = new WebhookManager(this);
            Realtime = new RealtimeClient(this);

            // Set tokens if provided
            if (!string.IsNullOrEmpty(options.AccessToken))
            {
                _storage.SetAsync("access_token", options.AccessToken).Wait();
            }
            if (!string.IsNullOrEmpty(options.RefreshToken))
            {
                _storage.SetAsync("refresh_token", options.RefreshToken).Wait();
            }

            _logger.LogInformation("DCAAuthClient initialized with API URL: {ApiUrl}", _options.ApiUrl);
        }

        /// <summary>
        /// Initializes a new instance with API key authentication.
        /// </summary>
        /// <param name="apiUrl">The API base URL.</param>
        /// <param name="apiKey">The API key for authentication.</param>
        public DCAAuthClient(string apiUrl, string apiKey)
            : this(new DCAAuthClientOptions
            {
                ApiUrl = apiUrl,
                ApiKey = apiKey
            })
        {
        }

        private HttpClient ConfigureHttpClient(HttpClient httpClient)
        {
            httpClient.BaseAddress = new Uri(_options.ApiUrl);
            httpClient.Timeout = TimeSpan.FromSeconds(_options.Timeout);

            // Set default headers
            httpClient.DefaultRequestHeaders.Clear();
            httpClient.DefaultRequestHeaders.Add("User-Agent", $"DCA-Auth-DotNet-SDK/{GetSdkVersion()}");
            httpClient.DefaultRequestHeaders.Add("X-SDK-Version", GetSdkVersion());
            httpClient.DefaultRequestHeaders.Add("X-SDK-Language", "C#");

            // Add API key if provided
            if (!string.IsNullOrEmpty(_options.ApiKey))
            {
                httpClient.DefaultRequestHeaders.Add("X-API-Key", _options.ApiKey);
            }

            // Add custom headers
            foreach (var header in _options.Headers)
            {
                httpClient.DefaultRequestHeaders.Add(header.Key, header.Value);
            }

            return httpClient;
        }

        private IAsyncPolicy<HttpResponseMessage> CreateRetryPolicy()
        {
            return HttpPolicyExtensions
                .HandleTransientHttpError()
                .OrResult(msg => msg.StatusCode == System.Net.HttpStatusCode.TooManyRequests)
                .WaitAndRetryAsync(
                    _options.RetryCount,
                    retryAttempt => TimeSpan.FromSeconds(Math.Pow(2, retryAttempt) * _options.RetryDelay),
                    onRetry: (outcome, timespan, retryCount, context) =>
                    {
                        var response = outcome.Result;
                        _logger.LogWarning(
                            "Retry {RetryCount} after {Delay}ms. Status: {StatusCode}",
                            retryCount,
                            timespan.TotalMilliseconds,
                            response?.StatusCode);

                        _eventEmitter.Emit("retry", new
                        {
                            RetryCount = retryCount,
                            Delay = timespan.TotalMilliseconds,
                            StatusCode = response?.StatusCode
                        });
                    });
        }

        /// <summary>
        /// Makes an HTTP request to the API.
        /// </summary>
        public async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken = default)
        {
            // Add authentication token
            await AddAuthenticationAsync(request);

            // Log request
            if (_options.Debug)
            {
                _logger.LogDebug(
                    "Request: {Method} {Path}",
                    request.Method,
                    request.RequestUri?.PathAndQuery);
            }

            // Execute with retry policy
            var response = await _retryPolicy.ExecuteAsync(
                async () => await _httpClient.SendAsync(request, cancellationToken));

            // Handle 401 - try to refresh token
            if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized && _options.AutoRefreshToken)
            {
                var refreshed = await RefreshTokenAsync(cancellationToken);
                if (refreshed)
                {
                    // Retry with new token
                    request = CloneRequest(request);
                    await AddAuthenticationAsync(request);
                    response = await _httpClient.SendAsync(request, cancellationToken);
                }
            }

            // Log response
            if (_options.Debug)
            {
                _logger.LogDebug(
                    "Response: {StatusCode} for {Path}",
                    response.StatusCode,
                    request.RequestUri?.PathAndQuery);
            }

            _eventEmitter.Emit("response", new
            {
                StatusCode = response.StatusCode,
                Path = request.RequestUri?.PathAndQuery
            });

            return response;
        }

        private async Task AddAuthenticationAsync(HttpRequestMessage request)
        {
            // Remove any existing auth header
            request.Headers.Authorization = null;

            // Add JWT token if available
            var accessToken = await _storage.GetAsync("access_token");
            if (!string.IsNullOrEmpty(accessToken))
            {
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);
            }
        }

        private async Task<bool> RefreshTokenAsync(CancellationToken cancellationToken)
        {
            await _refreshLock.WaitAsync(cancellationToken);
            try
            {
                var refreshToken = await _storage.GetAsync("refresh_token");
                if (string.IsNullOrEmpty(refreshToken))
                {
                    return false;
                }

                var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh")
                {
                    Content = new StringContent(
                        Newtonsoft.Json.JsonConvert.SerializeObject(new { refreshToken }),
                        System.Text.Encoding.UTF8,
                        "application/json")
                };

                var response = await _httpClient.SendAsync(request, cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    var tokens = Newtonsoft.Json.JsonConvert.DeserializeObject<TokenResponse>(json);

                    await SetTokensAsync(tokens.AccessToken, tokens.RefreshToken);

                    _logger.LogInformation("Successfully refreshed access token");
                    _eventEmitter.Emit("auth:refresh", tokens);

                    return true;
                }

                _logger.LogWarning("Failed to refresh token: {StatusCode}", response.StatusCode);
                return false;
            }
            finally
            {
                _refreshLock.Release();
            }
        }

        private HttpRequestMessage CloneRequest(HttpRequestMessage request)
        {
            var newRequest = new HttpRequestMessage(request.Method, request.RequestUri)
            {
                Content = request.Content,
                Version = request.Version
            };

            foreach (var header in request.Headers)
            {
                newRequest.Headers.TryAddWithoutValidation(header.Key, header.Value);
            }

            if (request.Content != null)
            {
                foreach (var header in request.Content.Headers)
                {
                    newRequest.Content.Headers.TryAddWithoutValidation(header.Key, header.Value);
                }
            }

            return newRequest;
        }

        /// <summary>
        /// Sets authentication tokens.
        /// </summary>
        public async Task SetTokensAsync(string accessToken, string refreshToken = null)
        {
            await _storage.SetAsync("access_token", accessToken);
            if (!string.IsNullOrEmpty(refreshToken))
            {
                await _storage.SetAsync("refresh_token", refreshToken);
            }

            _eventEmitter.Emit("auth:tokens", new { AccessToken = accessToken, RefreshToken = refreshToken });
        }

        /// <summary>
        /// Clears authentication tokens.
        /// </summary>
        public async Task ClearTokensAsync()
        {
            await _storage.RemoveAsync("access_token");
            await _storage.RemoveAsync("refresh_token");
            _eventEmitter.Emit("auth:clear", null);
        }

        /// <summary>
        /// Gets the current access token.
        /// </summary>
        public async Task<string> GetAccessTokenAsync()
        {
            return await _storage.GetAsync("access_token");
        }

        /// <summary>
        /// Checks if the client is authenticated.
        /// </summary>
        public async Task<bool> IsAuthenticatedAsync()
        {
            var token = await GetAccessTokenAsync();
            return !string.IsNullOrEmpty(token);
        }

        /// <summary>
        /// Connects to WebSocket for real-time updates.
        /// </summary>
        public async Task ConnectRealtimeAsync()
        {
            var token = await GetAccessTokenAsync();
            if (!string.IsNullOrEmpty(token))
            {
                await Realtime.SetAuthAsync(token);
            }
            await Realtime.ConnectAsync();
        }

        /// <summary>
        /// Disconnects from WebSocket.
        /// </summary>
        public async Task DisconnectRealtimeAsync()
        {
            await Realtime.DisconnectAsync();
        }

        private string GetSdkVersion()
        {
            return typeof(DCAAuthClient).Assembly.GetName().Version?.ToString() ?? "1.0.0";
        }

        /// <summary>
        /// Disposes the client and releases resources.
        /// </summary>
        public void Dispose()
        {
            if (_disposed)
                return;

            _refreshLock?.Dispose();
            Realtime?.Dispose();
            _httpClient?.Dispose();

            _disposed = true;
        }

        private class TokenResponse
        {
            public string AccessToken { get; set; }
            public string RefreshToken { get; set; }
        }
    }

    /// <summary>
    /// Configuration options for DCAAuthClient.
    /// </summary>
    public class DCAAuthClientOptions
    {
        /// <summary>
        /// The base URL for the API.
        /// </summary>
        public string ApiUrl { get; set; } = "https://api.dca-auth.com";

        /// <summary>
        /// API key for authentication.
        /// </summary>
        public string ApiKey { get; set; }

        /// <summary>
        /// JWT access token.
        /// </summary>
        public string AccessToken { get; set; }

        /// <summary>
        /// JWT refresh token.
        /// </summary>
        public string RefreshToken { get; set; }

        /// <summary>
        /// Request timeout in seconds.
        /// </summary>
        public int Timeout { get; set; } = 30;

        /// <summary>
        /// Number of retry attempts.
        /// </summary>
        public int RetryCount { get; set; } = 3;

        /// <summary>
        /// Delay between retries in seconds.
        /// </summary>
        public double RetryDelay { get; set; } = 1.0;

        /// <summary>
        /// Enable debug logging.
        /// </summary>
        public bool Debug { get; set; }

        /// <summary>
        /// Storage implementation for tokens.
        /// </summary>
        public IStorage Storage { get; set; }

        /// <summary>
        /// Automatically refresh expired tokens.
        /// </summary>
        public bool AutoRefreshToken { get; set; } = true;

        /// <summary>
        /// WebSocket URL for real-time updates.
        /// </summary>
        public string WsUrl { get; set; }

        /// <summary>
        /// Additional headers to include in requests.
        /// </summary>
        public Dictionary<string, string> Headers { get; set; } = new Dictionary<string, string>();
    }
}