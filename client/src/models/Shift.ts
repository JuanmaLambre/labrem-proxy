import { Experience, ExperienceJSON } from "./Experience";

export interface ShiftJSON {
  id: number;
  day: string; // yyyy-mm-dd
  start_time: string; // hh:mm:ss
  end_time: string; // hh:mm:ss
  experience: ExperienceJSON;
  availability: boolean;
}

export class Shift {
  id: number;
  day: string;
  startTime: string;
  endTime: string;
  availability: boolean;
  experience: Experience;

  constructor(json: ShiftJSON) {
    this.id = json.id;
    this.day = json.day;
    this.startTime = json.start_time;
    this.endTime = json.end_time;
    this.experience = new Experience(json.experience);
    this.availability = json.availability;
  }

  get isOpen(): boolean {
    if (!this.availability) return false;

    const now = Date.now();
    const startDatetime = new Date(`${this.day}T${this.startTime}`);
    const endDatetime = new Date(`${this.day}T${this.endTime}`);
    return startDatetime.getTime() <= now && now <= endDatetime.getTime();
  }

  toJSON(): ShiftJSON {
    return {
      id: this.id,
      day: this.day,
      start_time: this.startTime,
      end_time: this.endTime,
      availability: this.availability,
      experience: this.experience.toJSON(),
    };
  }
}
