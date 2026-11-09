import { CertificatsModule } from '../certificats/certificats.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inscription } from '../../database/entities/inscription.entity';
import { Qcm } from '../../database/entities/qcm.entity';
import { TentativeQcm } from '../../database/entities/tentative-qcm.entity';
import { TentativeBalayageService } from './tentative-balayage.service';
import { TentativeConsultationService } from './tentative-consultation.service';
import { TentativeCorrectionService } from './tentative-correction.service';
import { TentativeDemarrageService } from './tentative-demarrage.service';
import { TentativeMinuterieService } from './tentative-minuterie.service';
import { TentativeNotationService } from './tentative-notation.service';
import { TentativePassageService } from './tentative-passage.service';
import { TentativeSessionService } from './tentative-session.service';
import { TentativeTirageService } from './tentative-tirage.service';
import { TentativesController } from './tentatives.controller';

/**
 * Module du passage des QCM par l'apprenant (US-QCM-05 démarrage et
 * consultation ; US-QCM-06 tirage des questions ; US-QCM-07 réponses,
 * soumission, minuterie Redis et balayage des tentatives échues ; US-QCM-08
 * notation serveur et tentative figée NOTEE ; US-QCM-09 corrigé selon le mode
 * d'affichage ; US-QCM-10 verrou de session : une tentative EN_COURS n'est
 * utilisée que par la session qui la détient, si le QCM l'exige).
 *
 * Séparé de QcmModule (côté formateur) : aucune dépendance vers lui ni vers
 * FormationsModule, donc aucun risque d'import circulaire.
 * - forFeature : TentativeQcm (écriture) ; Qcm et sa configuration, Inscription
 *   (LECTURE, l'inscription est verrouillée pendant le démarrage). Questions et
 *   options sont lues par l'EntityManager de la transaction (tirage).
 * - Réponses et options cochées : écrites par l'EntityManager de la
 *   transaction, sous le verrou de la tentative (US-QCM-07).
 * - AuditService (US-AUTH-12), RedisModule et ConfigModule sont @Global.
 */
@Module({
  imports: [CertificatsModule, TypeOrmModule.forFeature([TentativeQcm, Qcm, Inscription])],
  controllers: [TentativesController],
  providers: [
    TentativeDemarrageService,
    TentativeConsultationService,
    TentativeTirageService,
    TentativeMinuterieService,
    TentativePassageService,
    TentativeBalayageService,
    TentativeNotationService,
    TentativeCorrectionService,
    TentativeSessionService,
  ],
})
export class TentativesModule {}
