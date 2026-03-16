interface ShiftJSON {
  id: number;
  name: string;
  day: string;
  start_time: string;
  end_time: string;
  experience_id: string;
}

export class Shift {
  id: number;
  name: string;
  day: string;
  startTime: string;
  endTime: string;
  experienceId: string;

  static hydrateAll(jsonArray: ShiftJSON[]): Shift[] {
    return jsonArray.map((json) => new Shift(json));
  }

  constructor(json: ShiftJSON) {
    this.id = json.id;
    this.name = json.name;
    this.day = json.day;
    this.startTime = json.start_time;
    this.endTime = json.end_time;
    this.experienceId = json.experience_id;
  }

  get isOpen(): boolean {
    const now = Date.now();
    const startDatetime = new Date(`${this.day}T${this.startTime}`);
    const endDatetime = new Date(`${this.day}T${this.endTime}`);
    return startDatetime.getTime() <= now && now <= endDatetime.getTime();
  }
}
