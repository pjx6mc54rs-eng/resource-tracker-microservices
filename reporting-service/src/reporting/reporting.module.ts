import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportingView } from '../entities/reporting-view.entity';
import { VerifiedUserGuard } from '../common/verified-user.guard';
import { ReportingController } from './reporting.controller';
import { DashboardService } from './dashboard.service';
import { UpstreamService } from './upstream.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReportingView]),
    HttpModule.register({ timeout: 5000, maxRedirects: 2 }),
    // Même bibliothèque que l'api-gateway (@nestjs/jwt), donc mêmes règles de
    // vérification. Aucun secret enregistré ici : `VerifiedUserGuard` le lit à
    // chaque vérification et refuse la requête s'il est absent, plutôt que de
    // figer au démarrage un repli implicite.
    JwtModule.register({}),
  ],
  controllers: [ReportingController],
  providers: [DashboardService, UpstreamService, VerifiedUserGuard],
  exports: [TypeOrmModule],
})
export class ReportingModule {}
