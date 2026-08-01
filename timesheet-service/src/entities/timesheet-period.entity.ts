import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

/**
 * Validation lifecycle of a monthly timesheet:
 *
 *   not_validated ──submit──► pending ──approve──► approved  (final, read-only)
 *         ▲                     │  │
 *         └────── recall ───────┘  └──reject──► rejected ──submit──► pending
 *
 * `not_validated` is the default for every month, including the ones logged
 * before this workflow existed — nothing counts as validated until a
 * responsable says so.
 */
export enum TimesheetPeriodStatus {
  NOT_VALIDATED = 'not_validated',
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/** A month of timesheet entries for one collaborateur, plus its validation state. */
@Entity('timesheet_periods')
@Unique('IDX_timesheet_periods_user_month', ['userId', 'year', 'month'])
export class TimesheetPeriod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'int' })
  year: number;

  /** 1-12 */
  @Column({ type: 'int' })
  month: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: TimesheetPeriodStatus.NOT_VALIDATED,
  })
  status: TimesheetPeriodStatus;

  @Column({ name: 'submitted_at', type: 'timestamp', nullable: true })
  submittedAt: Date | null;

  /**
   * Snapshot of the owner's responsables taken at submission time, so a later
   * change of manager can't strip the reviewer who is already handling it.
   */
  @Column({ name: 'reviewer_ids', type: 'simple-array', nullable: true })
  reviewerIds: string[] | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
