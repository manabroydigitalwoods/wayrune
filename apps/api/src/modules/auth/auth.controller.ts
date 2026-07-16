import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { LoginSchema, RegisterSchema, SwitchOrganizationSchema } from '@travel/contracts';
import { loadEnv } from '@travel/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  publicAuthPayload,
  setAuthCookies,
} from './auth-cookies';
import { CurrentUser, Public, type AuthUser } from '../../common/helpers';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.register(RegisterSchema.parse(body));
    setAuthCookies(res, tokens);
    return publicAuthPayload(tokens);
  }

  @Public()
  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.login(LoginSchema.parse(body));
    setAuthCookies(res, tokens);
    return publicAuthPayload(tokens);
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Body() body: { refreshToken?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken =
      body?.refreshToken ||
      (req.cookies?.[REFRESH_COOKIE] as string | undefined) ||
      '';
    const tokens = await this.auth.refresh(refreshToken);
    setAuthCookies(res, tokens);
    return publicAuthPayload(tokens);
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = (req.cookies?.[REFRESH_COOKIE] as string | undefined) || '';
    if (refreshToken) {
      await this.auth.revokeRefreshToken(refreshToken);
    }
    clearAuthCookies(res);
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Post('switch-organization')
  async switchOrganization(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = SwitchOrganizationSchema.parse(body);
    const refreshToken = (req.cookies?.[REFRESH_COOKIE] as string | undefined) || '';
    const tokens = await this.auth.switchOrganization(
      user,
      input.organizationId,
      refreshToken || undefined,
    );
    setAuthCookies(res, tokens);
    return publicAuthPayload(tokens);
  }

  @Public()
  @Get('oauth/google')
  googleAuthorize(@Query('org') org: string | undefined, @Res() res: Response) {
    res.redirect(this.auth.buildOAuthAuthorizeUrl('google', org));
  }

  @Public()
  @Get('oauth/google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    const env = loadEnv();
    try {
      const tokens = await this.auth.handleOAuthCallback('google', code, state);
      setAuthCookies(res, tokens);
      res.redirect(env.webOrigin);
    } catch {
      res.redirect(`${env.webOrigin}/login?sso=error`);
    }
  }

  @Public()
  @Get('oauth/microsoft')
  microsoftAuthorize(@Query('org') org: string | undefined, @Res() res: Response) {
    res.redirect(this.auth.buildOAuthAuthorizeUrl('microsoft', org));
  }

  @Public()
  @Get('oauth/microsoft/callback')
  async microsoftCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    const env = loadEnv();
    try {
      const tokens = await this.auth.handleOAuthCallback('microsoft', code, state);
      setAuthCookies(res, tokens);
      res.redirect(env.webOrigin);
    } catch {
      res.redirect(`${env.webOrigin}/login?sso=error`);
    }
  }
}
