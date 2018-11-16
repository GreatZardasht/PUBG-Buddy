import * as Discord from 'discord.js';
import { Command, CommandConfiguration, CommandHelp, DiscordClientWrapper } from '../../entities';
import { AnalyticsService as analyticsService, PubgPlatformService, DiscordMessageService } from '../../services';
import { PlatformRegion } from '../../pubg-typescript-api';
import { Status } from '../../pubg-typescript-api/entities/status';


export class Ping extends Command {

    conf: CommandConfiguration = {
        group: 'Utility',
        enabled: true,
        guildOnly: false,
        aliases: [],
        permLevel: 0
    };

    help: CommandHelp = {
        name: 'ping',
        description: 'Check your ping to the bot',
        usage: '<prefix>ping',
        examples: [
            '!pubg-ping'
        ]
    };

    async run(bot: DiscordClientWrapper, msg: Discord.Message, params: string[], perms: number) {
        analyticsService.track(this.help.name, {
            distinct_id: msg.author.id,
            discord_id: msg.author.id,
            discord_username: msg.author.tag
        });

        msg.channel.send('Ping?').then(async (message: Discord.Message) => {
            const botPing: number = message.createdTimestamp - msg.createdTimestamp;

            const platforms: PlatformRegion[] = [
                PlatformRegion.XBOX,
                PlatformRegion.STEAM,
                PlatformRegion.KAKAO
            ];
            const promises: Promise<Status>[] = platforms.map(platform => Status.get(PubgPlatformService.getApi(platform)));
            const statuses: Status[] = await Promise.all(promises);

            let status_str: string = '';
            for (let i = 0; i < statuses.length; i++) {
                const platformDisplay: string = PubgPlatformService.getPlatformDisplayName(platforms[i]);
                status_str += `${platformDisplay} - ${statuses[i].ping}ms\n`;
            }

            const embed: Discord.RichEmbed = DiscordMessageService.createBaseEmbed('PUBG Buddy Status');
            embed.setDescription('')
            embed.setThumbnail(bot.user.displayAvatarURL)
            embed.setColor(0x00AE86)
            embed.addField('PUBG-Buddy', `${botPing}ms`, true)
            embed.addField('PUBG API', status_str, true);


            message.edit({embed});
        });
    };

}
