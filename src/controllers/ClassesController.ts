import { Request, Response } from 'express'
import db from "../database/connection"
import convertHourToMinutes from "../utils/convertHoursToMinutes"

interface Schedule {
  week_day: number
  from: string
  to: string
}

export default class ClassesController {

  async index (request: Request, response: Response) {
    const filter = request.query
    const week_day = filter.week_day as string
    const subject = filter.subject as string
    const time = filter.time as string

    if (!week_day || !subject || !time) {
      return response.status(400).json({
        error: 'Missing filters to search classes'
      })
    }

    const timeInMinutes = convertHourToMinutes(time)

    const classes = await db('classes')
      .whereExists(function () {
        this.select('class_schedules.*')
          .from('class_schedules')
          .whereRaw('`class_schedules`.`class_id` = `classes`.`id`')
          .whereRaw('`class_schedules`.`week_day` = ??', [Number(week_day)])
          .whereRaw('`class_schedules`.`from` <= ??', [timeInMinutes])
          .whereRaw('`class_schedules`.`to` > ??', [timeInMinutes])
      })
      .where('classes.subject', '=', subject)
      .join('users', 'classes.user_id', '=', 'users.id')
      .select('classes.*', 'users.*')

    return response.json(classes)
    
  }

  async create (request: Request, response: Response) {
    const {
      name,
      avatar,
      whatsapp,
      bio,
      subject,
      schedules,
      cost
    } = request.body

    const trx = await db.transaction()

    try {
      const insertedUsersIds = await trx('users').insert({
        name,
        avatar,
        whatsapp,
        bio
      })
    
      const userId = insertedUsersIds[0]
    
      const insertedClassesIds = await trx('classes').insert({
        subject,
        cost,
        user_id: userId
      })
    
      const classId = insertedClassesIds[0]
    
      const classSchedules = schedules.map((schedule: Schedule) => {
        return {
          class_id: classId,
          week_day: schedule.week_day,
          from: convertHourToMinutes(schedule.from),
          to: convertHourToMinutes(schedule.to)
        }
      })
    
      await trx('class_schedules').insert(classSchedules)
    
      await trx.commit()
    
      return response.status(201).send()
    } catch (err) {
      console.log(err)

      await trx.rollback()

      return response.status(400).json({
        error: 'Unexpected error while creating new class'
      })
    }
  }
}