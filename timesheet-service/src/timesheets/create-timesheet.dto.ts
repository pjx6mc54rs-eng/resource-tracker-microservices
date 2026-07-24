export class CreateTimesheetDto {
  id?: string;
  projectId?: string;
  taskId?: string;
  date: string;
  hoursSpent?: number;
  isHoliday?: boolean;
  note?: string;
}

export class BulkSaveTimesheetsDto {
  entries: CreateTimesheetDto[];
}
