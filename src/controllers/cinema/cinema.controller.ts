import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { CinemaListResponseModel } from '../../models/cinema/cinema-list-response.model';
import { ConfigCinemaSeatList } from '../../config/config-cinema-seat-list';
import { CinemaTicketService } from '../../services/cinema-ticket/cinema-ticket.service';
import { CinemaTicketRequestModel } from '../../models/cinema/cinema-ticket-request.model';
import { Request, Response } from 'express';
import { CinemaTicketResponseModel } from '../../models/cinema/cinema-ticket-response.model';
import { CinemaTicket } from '../../entities/cinema-ticket.entity';
import { User } from '../../entities/user.entity';
import { UserTokenPayload } from '../../models/user/user-token-payload';

@Controller('cinema')
export class CinemaController {
  constructor(private cinemaTicketService: CinemaTicketService) {}

  @Get('list')
  async list(): Promise<CinemaListResponseModel> {
    const tickets = await this.cinemaTicketService.getAll();

    const response = new CinemaListResponseModel();
    response.list = ConfigCinemaSeatList.map((seat) => ({
      cinema_id: seat.cinema_id,
      seat_id: seat.seat_id,
      is_empty: !tickets.some(
        (x) => x.cinema_id === seat.cinema_id && x.seat_id === seat.seat_id,
      ),
    }));
    return response;
  }

  @Post('ticket')
  async ticket(
    @Body() body: CinemaTicketRequestModel,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CinemaTicketResponseModel> {
    const response = new CinemaTicketResponseModel();
    if (!body.cinema_id || !body.seat_id) {
      res.status(HttpStatus.BAD_REQUEST);
      return response;
    }

    const payload = req['token_payload'] as UserTokenPayload;
    if (!payload) {
      res.status(HttpStatus.UNAUTHORIZED);
      return response;
    }

    try {
      const ticket = await this.cinemaTicketService.transaction(
        async (entityManager) => {
          let ticket = await entityManager.findOne(CinemaTicket, {
            transaction: true,
            where: {
              cinema_id: body.cinema_id,
              seat_id: body.seat_id,
            },
            lock: {
              mode: 'pessimistic_write',
            },
          });

          if (ticket) return null;

          ticket = entityManager.create(CinemaTicket);
          ticket.cinema_id = body.cinema_id;
          ticket.seat_id = body.seat_id;
          ticket.user = { id: payload.id } as User;
          await entityManager.save(ticket);

          return ticket;
        },
      );

      if (ticket) {
        res.status(HttpStatus.OK);
        response.ticket_id = ticket.id;
      } else {
        res.status(HttpStatus.BAD_REQUEST);
      }
    } catch (err) {
      console.error(err);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return response;
  }
}
