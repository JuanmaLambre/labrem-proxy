import { fromJSON } from "postcss";

export class Shift {
  static hydrateAll(jsonArray) {
    return jsonArray.map((json) => new Shift(json));
  }

  constructor(json) {
    this.id = json.id;
    this.name = json.name;
    this.day = json.day;
    this.startTime = json.start_time;
    this.endTime = json.end_time;
    this.experienceId = json.experience_id;
  }

  get isOpen() {
    const now = Date.now();
    const startDatetime = new Date(`${this.day}T${this.startTime}`);
    const endDatetime = new Date(`${this.day}T${this.endTime}`);
    return startDatetime <= now && now <= endDatetime;
  }
}
