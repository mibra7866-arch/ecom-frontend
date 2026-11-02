import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ApiQueryParams = HttpParams | Record<string, string | number | boolean>;

/**
 * Centralizes all HTTP communication with the ECom API: base URL resolution, method verbs, and
 * request shape. Feature services (AuthService, SellersService, etc.) call this instead of
 * injecting HttpClient directly, so no component or service hardcodes `environment.apiUrl` or
 * repeats the same get/post/patch boilerplate. Auth headers, credentials and 401 refresh-retry are
 * still handled by `authInterceptor` (registered globally in app.config.ts) — this service only
 * owns building the request, not the cross-cutting concerns already covered by that interceptor.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  /** headers lets a caller override the auth header authInterceptor would otherwise attach from TokenService — e.g. ChatService's pre-login accessTokenOverride, where there's no real session token to fall back on. */
  get<TResponse = object>(path: string, params?: ApiQueryParams, headers?: HttpHeaders): Observable<TResponse> {
    return this.http.get<TResponse>(this.url(path), { params, headers });
  }

  post<TResponse = object, TRequest = unknown>(path: string, body: TRequest, params?: ApiQueryParams, headers?: HttpHeaders): Observable<TResponse> {
    return this.http.post<TResponse>(this.url(path), body, { params, headers });
  }

  /** For multipart/form-data submissions (file uploads) — do not set a Content-Type header here, the browser sets the multipart boundary automatically. headers is for the same pre-login accessTokenOverride case as get()/post() (see ChatService.uploadAttachment). */
  postFormData<TResponse = object>(path: string, formData: FormData, headers?: HttpHeaders): Observable<TResponse> {
    return this.http.post<TResponse>(this.url(path), formData, { headers });
  }

  put<TResponse = object, TRequest = unknown>(path: string, body: TRequest): Observable<TResponse> {
    return this.http.put<TResponse>(this.url(path), body);
  }

  /** For multipart/form-data PUT submissions (e.g. replacing a product's image alongside its other fields) — same no-Content-Type-header reasoning as postFormData. */
  putFormData<TResponse = object>(path: string, formData: FormData): Observable<TResponse> {
    return this.http.put<TResponse>(this.url(path), formData);
  }

  patch<TResponse = object, TRequest = unknown>(path: string, body: TRequest): Observable<TResponse> {
    return this.http.patch<TResponse>(this.url(path), body);
  }

  delete<TResponse = object>(path: string, params?: ApiQueryParams): Observable<TResponse> {
    return this.http.delete<TResponse>(this.url(path), { params });
  }

  private url(path: string): string {
    return `${environment.apiUrl}/${path.replace(/^\/+/, '')}`;
  }
}
